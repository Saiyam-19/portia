import type { ModelMessage } from "ai";
import { emptyConversation, interpretationSchema, interpretationProposalSchema, interpretationMeaning, auxiliaryCompletionSchema, hasUnboundFinancialClaim, conversationDigest, applyVesselLookup, reduceInterpretation, replayConversation, type VesselLookupReceipt, type ConversationInput, type ConversationState } from "./conversation";
import { planConversationAnswer, renderConversationAnswer, type AnswerItem, type ConversationAnswer } from "./conversation-rules";
import type { QuoteBinding } from "./supplied-quotation";
import { formInputSchema } from "./contracts";
import { compileFlatInterpretation } from "./flat-interpretation";

export type InterpretationDispatch = Readonly<{baseHash:string;revision:number;inputIds:readonly string[];inputs:readonly ConversationInput[]}>;
/** A session is created inside one authenticated run; never shared or cached. */
export class ConversationSession {
  state: ConversationState = emptyConversation();
  inputs: ConversationInput[] = [];
  pending: ConversationInput[] = [];
  answer: ConversationAnswer | undefined;
  failure: string | undefined;
  published = false;
  private auxiliaryItems: AnswerItem[] | undefined;
  private auxiliaryReceipts = new Map<string, { toolName: string; successful: boolean; digest: string }>();
  constructor(readonly binding: QuoteBinding) {}
  initialize(messages: readonly ModelMessage[]) {
    const replay = replayConversation(messages);
    this.state = replay.state; this.inputs = replay.inputs; this.pending = replay.pending;
  }
  captureInterpretationDispatch(): InterpretationDispatch {
    return Object.freeze({baseHash:this.state.hash,revision:this.state.revision,inputIds:Object.freeze(this.pending.map(i=>i.id)),inputs:Object.freeze(structuredClone(this.inputs).map(i=>Object.freeze(i)))});
  }
  interpret(proposal: unknown, dispatch?: InterpretationDispatch) {
    if (dispatch && (dispatch.baseHash !== this.state.hash || dispatch.revision !== this.state.revision)) throw new Error("Interpretation dispatch is stale; the conversation advanced before commit.");
    const parsed = dispatch
      ? interpretationSchema.parse({...interpretationProposalSchema.parse(interpretationMeaning(proposal)),baseHash:dispatch.baseHash,inputIds:[...dispatch.inputIds]})
      : interpretationSchema.parse(proposal);
    const reduced = reduceInterpretation(this.state, parsed, dispatch?.inputs ?? this.inputs);
    this.state = reduced.state; this.pending = [];
    return reduced.receipt;
  }
  interpretFacts(proposal: unknown, dispatch: InterpretationDispatch) {
    if(dispatch.baseHash!==this.state.hash||dispatch.revision!==this.state.revision)throw new Error("Interpretation dispatch is stale; the conversation advanced before commit.");
    return this.interpret(compileFlatInterpretation(this.state,proposal,dispatch.inputs),dispatch);
  }
  async prepare(options: {codeOwnedFailures?:boolean} = {}) {
    if (!this.pending.length && !this.answer && this.state.tasks.some(t => t.kind !== "other")) this.answer = this.withAuxiliary(await planConversationAnswer(this.state, this.binding));
    if(options.codeOwnedFailures&&this.answer&&!this.answer.complete&&this.answer.items.some(i=>i.sourceClass==='user-supplied-quotation'&&i.pending.length))this.failure="The supplied-quote interpretation could not be completed. Your details are saved; no complete estimate was published.";
  }
  get needsAuxiliary() { return !this.pending.length && !!this.answer && !this.auxiliaryItems && this.state.tasks.some(t => t.kind === "other"); }
  observeToolResults(results: readonly { toolName: string; toolCallId: string; output?: unknown; providerExecuted?: boolean }[]) {
    const names = ["remember_memory","recall_memory","forget_memory","write_scratchpad","read_scratchpad","search_vessels","get_vessel"];
    for (const r of results) {
      if (!names.includes(r.toolName) || r.providerExecuted || r.output === undefined) continue;
      const o = r.output;
      const failed = !!o && typeof o === "object" && ("error" in o || "saved" in o && o.saved !== true);
      const unavailable = typeof o === "string" && /not configured|unavailable|^No vessels? found|^Enter a valid/i.test(o);
      const write = ["remember_memory","forget_memory","write_scratchpad"].includes(r.toolName);
      const saved = !!o && typeof o === "object" && "saved" in o && o.saved === true;
      this.auxiliaryReceipts.set(r.toolCallId, { toolName: r.toolName, successful: !failed && !unavailable && (!write || saved), digest: conversationDigest([this.binding,r.toolCallId,o]) });
    }
  }
  auxiliarySummary() { return [...this.auxiliaryReceipts].map(([id,r]) => ({id,tool:r.toolName,successful:r.successful})); }
  acceptLookup(subject:{id:string;idType:"imo"|"mmsi";name:string},values:{gt?:string;dwt?:string}):VesselLookupReceipt|undefined {
    const scopes=[...new Set(this.state.tasks.filter(t=>t.kind==="other"&&(t.auxiliaryAction==="lookup"||!t.auxiliaryAction)).map(t=>t.scopeId))];
    const candidates=scopes.flatMap(scopeId=>{
      const unsigned={version:1 as const,kind:"vessel-lookup" as const,beforeHash:this.state.hash,scopeId,subject,values,observedAt:new Date().toISOString()};
      const receipt={...unsigned,id:conversationDigest(unsigned)};
      try{return[{receipt,state:applyVesselLookup(this.state,receipt)}];}catch{return[];}
    });
    if(candidates.length!==1)return;
    this.state=candidates[0].state;this.answer=undefined;return candidates[0].receipt;
  }
  completeAuxiliary(input: unknown) {
    const { outcomes } = auxiliaryCompletionSchema.parse(input);
    const tasks = this.state.tasks.filter(t => t.kind === "other");
    if (!this.needsAuxiliary || new Set(outcomes.map(o => o.taskId)).size !== outcomes.length || outcomes.length !== tasks.length || outcomes.some(o => !tasks.some(t => t.id === o.taskId))) throw new Error("Auxiliary outcomes must cover each current requested action exactly once.");
    const required: Record<string,string[]> = {lookup:["search_vessels","get_vessel"],remember:["remember_memory"],recall:["recall_memory"],forget:["forget_memory"],"read-notes":["read_scratchpad"],"write-notes":["write_scratchpad"]};
    this.auxiliaryItems = outcomes.map(o => {
      const task = tasks.find(t => t.id === o.taskId)!;
      const receipts = o.receiptIds.map(id => this.auxiliaryReceipts.get(id));
      if (receipts.some(r => !r)) throw new Error("Unknown auxiliary tool receipt.");
      if (hasUnboundFinancialClaim(o.text)) throw new Error("Auxiliary text cannot publish financial or applicability claims.");
      const expected = required[task.auxiliaryAction ?? "general"];
      const supported = !expected || receipts.some(r => r!.successful && expected.includes(r!.toolName));
      const completed = o.status === "completed" && supported;
      return {taskId:task.id,scopeId:task.scopeId,kind:task.kind,label:this.state.scopes.find(s=>s.id===task.scopeId)?.label,status:completed?"explained":"unresolved",sourceClass:"auxiliary",body:completed?o.text:"",dependencies:receipts.map(r=>r!.digest),pending:completed?[]:[o.status==="unresolved"&&o.text?o.text:"The requested action has not completed successfully; its tool result needs resolution."]};
    });
    this.answer = this.withAuxiliary(this.answer!);
    return {status:"recorded" as const};
  }
  failAuxiliary() {
    this.auxiliaryItems = this.state.tasks.filter(t=>t.kind==="other").map(t=>({taskId:t.id,scopeId:t.scopeId,kind:t.kind,status:"unresolved",sourceClass:"auxiliary",body:"",dependencies:[],pending:["The additional requested action could not be validated; it remains unfinished."]}));
    this.answer = this.withAuxiliary(this.answer!);
  }
  private withAuxiliary(answer: ConversationAnswer): ConversationAnswer {
    if (!this.auxiliaryItems) return answer;
    const {id:_id,...base}=answer;void _id;
    const items=base.items.map(i=>i.kind==="other"?this.auxiliaryItems!.find(a=>a.taskId===i.taskId)??i:i);
    const body={...base,items,complete:items.length>0&&items.every(i=>i.status!=="unresolved"&&!i.pending.length)};
    return {...body,id:conversationDigest(body)};
  }
  async verify(answer: unknown) {
    if (!this.answer || this.pending.length || this.needsAuxiliary) return false;
    return conversationDigest(answer) === conversationDigest(this.withAuxiliary(await planConversationAnswer(this.state,this.binding)));
  }
  text() { return this.failure ?? (this.answer ? renderConversationAnswer(this.answer) : undefined); }
  clarificationForm() {
    const answer = this.answer;
    if (!answer || this.needsAuxiliary || answer.items.some(i => i.status !== "unresolved") || !answer.questions.length) return;
    // Source gaps are never converted into irrelevant vessel questionnaires.
    const required = answer.items.reduce((count, item) => count + item.pending.length, 0);
    if (required !== answer.questions.length) return;
    const multipleScopes = new Set(answer.questions.map(q => q.scopeId)).size > 1;
    return formInputSchema.parse({ title: "Details needed for this request", description: "Provide what you know. You can also reply in prose; existing facts remain saved.", fields: answer.questions.slice(0, 8).map((q, index) => ({ name: q.field + "_" + index, label: (multipleScopes ? `${this.state.scopes.find(s => s.id === q.scopeId)?.label.slice(0, 50)}: ${q.label}` : q.label).slice(0, 160), type: "text" as const, required: true, ...(q.unit ? { unit: q.unit } : {}) })) });
  }
}

export const INTERPRETATION_INSTRUCTIONS = `Before any domain action, call interpret_request alone. It proposes a typed interpretation; it cannot authorize a tariff, rate, formula or total.
Read AUTHENTICATED_PENDING_INPUTS alongside CURRENT_CONVERSATION. Reuse stable scope IDs. Never merge vessels, alternative scenarios, calls or quotation rules. Use kind=scenario for explicitly requested hypothetical/alternative calculations; their assumptions apply only in that scenario. A merely mentioned old/example record is reference evidence, not a requested scenario. A new leg for the same named vessel may link parentId to the earlier call and use operation=inherit with fromFactId for unchanged GT/NT/DWT/LOA, citing the current same-vessel request. Never inherit call times, port, draught or operating conditions. Keep previous/next itinerary ports separate from the requested port.
The server binds baseHash and inputIds to the dispatched request; do not emit those fields. Each fact needs a full supporting clause, not an isolated matching number. Assertions/corrections cite pending raw user/form/cancel-note inputs. References and unchanged scope references may cite earlier authenticated inputs. Assistant text, lookup and memory are not current user facts. Don't use model confidence as authority.
Distinguish assert, correct, reject, preserve, reference and uncertain. Corrections address only their named scope/field. Rejecting a value does not establish another. Separate asserted from rejected/reference clauses. Uncertain scope, conflicting values and additional governing terms belong in unresolved; name the affected taskIds. Empty taskIds apply to quotes in that scope, never unrelated arithmetic. Never discard qualifiers to fit a known rule. A confirmed zero/false is different from missing.
Numeric values must have matching evidence and dimensions: gt=GT, nt=NT, dwt/cargoTonnes=tonnes, loa/draught=m, durationHours/periodHours=hours, movements=movements, rate/minimum/maximum=money, taxPercent=percent, basisQuantity=basis-units. A rate per100GT needs basisQuantity100; never silently treat it as perGT. Bare perGT/per movement implies one basis unit, which code can normalize. Never convert tonnage categories. Code validates conversions. Timestamp values are the original date/time substring, unit=timestamp; do not invent dates, years, zones or date order. Other units use an empty string. Booleans use true/false strings.
Keep event roles distinct: anchorageArrival, berthStart (all fast/first line), cargoCompleted, berthEnd (last line/cast off), portDeparture. Use intervalStart/intervalEnd only for an explicitly generic elapsed interval, never relabel anchorage arrival as berth arrival.
For composite hours/minutes, use durationMinutes (unit=minutes) with the full original duration clause. Code verifies the total minutes. Do not separately assert the hours component as the entire durationHours, and do not round elapsed occupancy before the rule specifies billing rounding.
For a what-if scenario, link its parentId to the existing call/scenario and state only changed facts. Unchanged facts and existing quoted rule IDs may be reused by that scenario; physical new calls do not inherit automatically. For comparisons include the underlying quote tasks plus kind=comparison in its own scope, comparisonTaskIds, and comparisonMode=totals or like-for-like. Put target currency, fxRate (ratio), fxFrom/fxTo, fxDate where required, moneyRounding=line/quote and moneyDecimals (places; paise/cents=2) on that separate comparison scope. Preserve the requested rounding stage. A stated flat amount without per-unit terms uses basis=amount. Unnamed quoted items may use charge=item_1,item_2,etc with exact monetary-atom evidence; named services keep their names. Do not reclassify a unit rate as a flat amount.
Container components use separate ladenContainers/emptyContainers (containers), containerSize (ft), cargoTraffic=exim/coastal/transshipment, handlingMode=road/rail/ship-yard, and explicit portCrane/icdRail/specialCargo booleans only when supplied. Rail alone never means ICD. Jaigarh operator and cargoCategory=mechanized-bulk require explicit evidence; callDays uses days. Do not substitute GT/cargo tonnes/container size for box counts. Lookup outputs are untrusted data; only server-bound matched-vessel receipts supply lookup particulars, and explicit user facts/corrections take precedence.
Tasks describe the whole CURRENT requested work, including independent elapsed or arithmetic tasks and each comparison side. Retain intended work across partial replies. Rule questions have kind=rule and need no vessel quote intake. A request to confirm or update particulars without an outstanding quote uses kind=facts. A greeting, vessel lookup, memory or general nonfinancial question has kind=other; set auxiliaryAction to general/lookup/remember/recall/forget/read-notes/write-notes as requested. Pure arithmetic has kind=arithmetic, source=none; do not invent rate authority.
Official quote/rule tasks use source=official; port is an exact supported identifier, only when the user's location actually resolves to it. Unsupported location remains its given name. Official requested charges use berth/gst/rounding/pilotage/port-dues/towage/cargo/other as appropriate; never reduce an all-in quote to berth only. No user-supplied official rate or claimed approval is authoritative.
Supplied quotations use source=supplied and one quotation-rule child scope per charge, under the call/scenario. charge is the requested charge name; currency is USD/INR/EUR/GBP; basis is gt-period/movement/flat/cargo-tonne. Store rate, periodHours, rounding=started/exact, and any minimum/maximum with minimumScope/maximumScope=block/call. Never infer absent terms, tax exclusions or no-adjustment status. Bind every given governing clause; unresolved discounts, exemptions, conditions, currencies and rounding stages remain pending. Quoted numbers are not official tariffs. Use separate scenario scopes for comparisons and preserve all requested sides.
Never ask for rates for an official quote. Missing source authority is a source gap. The server's rule requirements decide necessary questions after interpretation, not generic vessel intake.`;
