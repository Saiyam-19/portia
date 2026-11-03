import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { LogoMark } from "../Logo";

/*
 * Four Berthwise conversations in the app's own chat UI (portia: window header, user bubble,
 * Berthwise byline, tool trail, table card, dock composer), recoloured to the site palette.
 * Every figure is the design's illustrative Portia mock value, not a quotation.
 */

const src = (n: "pdf" | "excel" | "word" | "csv") => `/media/sources/${n}.webp`;

function Window({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <article className="ag-card" aria-label={`Berthwise conversation: ${title}`} {...(first ? { "data-first": "" } : {})}>
      <header className="ag-head">
        <span className="ag-head-title">{title}</span>
        <span className="ag-head-ctl" aria-hidden="true">
          <Icon name="minus" />
          <Icon name="maximize" />
          <Icon name="x" />
        </span>
      </header>
      <div className="ag-seq" data-seq>
        <div className="ag-content">{children}</div>
      </div>
      <div className="ag-composer" aria-hidden="true">
        <p className="ag-composer-text" data-composer>
          Ask a follow-up…
        </p>
        <div className="ag-composer-bar">
          <span className="ag-ghost">
            <Icon name="at" stroke={1.9} />
          </span>
          <span className="ag-send">
            <Icon name="arrowUp" stroke={2.4} />
          </span>
        </div>
      </div>
    </article>
  );
}

const User = ({ children }: { children: ReactNode }) => (
  <div className="ag-user" data-f="prompt">
    <p>{children}</p>
  </div>
);

const Mention = ({ children }: { children: string }) => <span className="ag-mention">@{children}</span>;

/** Byline plus the tool trail: "Working" shimmer while it runs, a one-line summary once done.
 * Only the first conversation lists its steps. */
function Trail({ done, steps, open = false }: { done: string; steps: { icon: IconName; text: ReactNode }[]; open?: boolean }) {
  return (
    <div className="ag-trail" data-f="status">
      <div className="ag-by">
        <span className="ag-mark">
          <LogoMark />
        </span>
        Berthwise
      </div>
      <div className="ag-steps-head" data-steps-head>
        <span className="ag-steps-label">
          <span className="ag-shimmer" data-work>
            Working
          </span>
          <span data-done style={{ opacity: 0 }}>
            {done}
          </span>
        </span>
        <Icon name="chevronDown" className="ag-steps-chev" />
      </div>
      {open && (
        <ol className="ag-steps" data-steps>
          {steps.map((s, i) => (
            <li key={i}>
              <div>
                <span className="ag-step-ic">
                  <Icon name={s.icon} />
                </span>
                <span>{s.text}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const Chips = ({ items }: { items: string[] }) => (
  <div className="ag-chips" data-f="followups">
    {items.map((c) => (
      <span key={c} className="ag-chip">
        {c}
      </span>
    ))}
  </div>
);

const Doc = ({ kind, name }: { kind: "pdf" | "excel"; name: string }) => (
  <span className="ag-doc">
    <img src={src(kind)} alt="" width={14} height={14} loading="lazy" decoding="async" />
    {name}
  </span>
);

/** Card one: the animated conversation the source tiles fold into. */
function Estimate() {
  const rows = [
    ["Port dues", "32,450 × ₹1.92", "₹62,304", "SOR §2"],
    ["Pilotage · in + out", "2 × ₹48,650", "₹97,300", "SOR §4"],
    ["Berth hire", "32,450 × ₹0.0524 × 48h", "₹81,618", "SOR §6"],
    ["Towage", "4 × ₹36,500", "₹1,46,000", "SOR §5"],
    ["Mooring / unmooring", "2 × ₹8,750", "₹17,500", "SOR §7"],
  ];
  return (
    <Window title="Mumbai · MV Ocean Pioneer" first>
      <User>Charges for IMO 9321483 at Mumbai, 48 hours at Indira Dock</User>
      <Trail
        open
        done="Used 3 tools · read 4 tariff sections"
        steps={[
          { icon: "ship", text: <>Found MV Ocean Pioneer<em> · 32,450 GRT</em></> },
          { icon: "book", text: "Reading Mumbai Port’s scale of rates" },
          { icon: "anchor", text: "Matching Indira Dock’s berth and pilotage slabs" },
          { icon: "clock", text: "Pricing 48 hours alongside" },
          { icon: "calculator", text: "Totalling 5 charges" },
        ]}
      />
      <p className="ag-text" data-f="report">
        Here’s the itemised estimate for a <b>48-hour</b> call at <b>Indira Dock</b>. It comes to about <b>₹4,04,722</b>, before GST.
      </p>
      <div className="ag-table" data-f="table">
        <div className="ag-table-head">
          <span className="ag-table-ic">
            <Icon name="ship" />
          </span>
          <span>
            <b>Estimated port charges</b>
            <small>Mumbai Port Authority · Indira Dock</small>
          </span>
        </div>
        <div className="ag-tags">
          <span>MV Ocean Pioneer</span>
          <span className="ag-mono">IMO 9321483</span>
          <span>32,450 GRT</span>
          <span>LOA 228 m</span>
        </div>
        {rows.map(([name, basis, amount, ref]) => (
          <div key={name} className="ag-row" data-row>
            <span>
              {name}
              <small>{basis}</small>
            </span>
            <span className="ag-src">
              <img src={src("pdf")} alt="" width={14} height={14} loading="lazy" decoding="async" />
              {ref}
            </span>
            <b>{amount}</b>
          </div>
        ))}
        <div className="ag-row ag-total" data-row>
          <span>Total estimate</span>
          <span className="ag-src">Excluding GST</span>
          <b>₹4,04,722</b>
        </div>
      </div>
      <p className="ag-text ag-muted" data-f="insight">
        Towage is over a third of the call. Two hours less alongside takes about ₹3,400 off berth hire.
      </p>
      <Chips items={["Compare with Jaigarh", "Try 36 hours", "Show the rates"]} />
    </Window>
  );
}

function Compare() {
  return (
    <Window title="Mumbai vs Jaigarh pilotage">
      <User>
        Compare <Mention>Mumbai</Mention> and <Mention>Jaigarh</Mention> pilotage for 30,000 GRT
      </User>
      <Trail done="Compared 2 tariff schedules" steps={[]} />
      <p className="ag-text" data-f="report">
        Jaigarh comes in <b>₹11,600 lower</b> for the same vessel, inward and outward.
      </p>
      <div className="ag-table ag-vs" data-f="table">
        <div className="ag-vs-row ag-vs-top">
          <span>Pilotage, side by side</span>
          <b>Mumbai</b>
          <b>Jaigarh</b>
        </div>
        <div className="ag-vs-row" data-row>
          <span>Inward + outward</span>
          <b>₹82,400</b>
          <b className="ag-best">₹70,800</b>
        </div>
        <div className="ag-vs-row" data-row>
          <span>Vessel</span>
          <span>30,000 GRT</span>
          <span>30,000 GRT</span>
        </div>
        <div className="ag-vs-row" data-row>
          <span>Source</span>
          <Doc kind="pdf" name="Mumbai_SOR.pdf" />
          <Doc kind="pdf" name="Jaigarh_Tariff.pdf" />
        </div>
      </div>
      <p className="ag-text ag-muted" data-f="insight">Both figures are from each port’s published schedule, before GST.</p>
      <Chips items={["Add towage", "Show the slabs"]} />
    </Window>
  );
}

function Vessel() {
  const rows = [
    ["Type", "Bulk carrier"],
    ["Gross tonnage", "32,450 GRT"],
    ["Net tonnage", "18,966 NRT"],
    ["Length overall", "228 m"],
  ];
  return (
    <Window title="Look up a vessel">
      <User>Look up IMO 9321483</User>
      <Trail done="Searched vessels" steps={[]} />
      <p className="ag-text" data-f="report">
        Found <b>MV Ocean Pioneer</b>. These particulars feed every estimate, and you can change any of them.
      </p>
      <div className="ag-table" data-f="table">
        <div className="ag-table-head">
          <span className="ag-table-ic">
            <Icon name="ship" />
          </span>
          <span>
            <b>MV Ocean Pioneer</b>
            <small className="ag-mono">IMO 9321483</small>
          </span>
        </div>
        {rows.map(([k, v]) => (
          <div key={k} className="ag-row ag-row-kv" data-row>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <Chips items={["Estimate at Mumbai", "Compare three ports"]} />
    </Window>
  );
}

const WATCH = [
  { port: "Mumbai Port Authority", file: "Mumbai_SOR_2026.pdf" },
  { port: "JNPA", file: "JNPA_Scale_of_Rates.pdf" },
  { port: "Jaigarh", file: "Jaigarh_Tariff_v3.xlsx" },
] as const;

/** Card four: its rows re-check one after another as it plays, like Lev's checklist. */
function Watch() {
  return (
    <Window title="Tariff check">
      <User>
        Are these tariffs current? <Mention>Mumbai</Mention> <Mention>JNPA</Mention> <Mention>Jaigarh</Mention>
      </User>
      <Trail done="Checked 3 schedules for revisions" steps={[]} />
      <div className="ag-watch">
        <p className="ag-text" data-f="report" data-watch-report>
          All three schedules are current.
        </p>
        <div className="ag-table" data-f="table">
          <div className="ag-table-head ag-table-head-split">
            <span>
              <b>Tariff check</b>
              <small>3 ports · published schedules</small>
            </span>
            <small data-watch-count>3 of 3 current</small>
          </div>
          {WATCH.map((w) => (
            <div key={w.port} className="ag-row ag-watch-row" data-watch-row="done">
              <span className="ag-tick">
                <Icon name="check" stroke={3} />
              </span>
              <span className="ag-spin">
                <Icon name="loader" stroke={2.4} />
              </span>
              <span className="ag-ring" />
              <span className="ag-watch-port">{w.port}</span>
              <Doc kind={w.file.endsWith("xlsx") ? "excel" : "pdf"} name={w.file} />
            </div>
          ))}
        </div>
      </div>
      <p className="ag-text ag-muted" data-f="insight">Schedules are re-read whenever a port publishes a revision.</p>
      <Chips items={["What changed this year?", "Browse coverage"]} />
    </Window>
  );
}

export function Threads() {
  return (
    <>
      <Estimate />
      <Compare />
      <Vessel />
      <Watch />
    </>
  );
}
