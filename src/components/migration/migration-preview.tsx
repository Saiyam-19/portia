"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useConvexAuth, usePaginatedQuery, useQuery } from "convex/react";
import { FormEvent, useState } from "react";
import { migrationAuthClient } from "@/lib/migration/auth-client";
import type {
  MigrationChatRequest,
  ModelAlias,
} from "@/lib/migration/contracts";
import { migrationTransport } from "@/lib/migration/transport";
import { migrationRunState } from "@/lib/migration/client-state";

type MigrationMetadata = {
  conversationId?: string;
  runId?: string;
  revision?: number;
};

type MigrationMessage = UIMessage<MigrationMetadata>;

function textFromMessage(message: MigrationMessage): string {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await migrationAuthClient.signIn.email({ email, password });
      if (result.error) setError(result.error.message ?? "Sign in failed.");
    } catch {
      setError("Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <form onSubmit={submit} className="w-full rounded-card bg-surface p-6 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange">Development preview</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Migration sign in</h1>
        <p className="mt-2 text-sm leading-6 text-ink-2">
          Separate Convex and AI SDK migration environment with bundled tariff specialists, bounded decimal calculation, and vessel lookup fallback.
        </p>
        <label htmlFor="migration-email" className="mt-5 block text-sm font-medium text-ink">Email</label>
        <input
          id="migration-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 h-10 w-full rounded-control bg-field px-3 text-sm text-ink shadow-[inset_0_0_0_1px_var(--line)]"
          required
        />
        <label htmlFor="migration-password" className="mt-4 block text-sm font-medium text-ink">Password</label>
        <input
          id="migration-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 h-10 w-full rounded-control bg-field px-3 text-sm text-ink shadow-[inset_0_0_0_1px_var(--line)]"
          required
        />
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-5 h-10 w-full rounded-control bg-ink px-4 text-sm font-medium text-canvas disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-3 text-xs text-ink-3">Accounts are provisioned privately. Public sign-up is disabled.</p>
      </form>
    </main>
  );
}

function PendingForm({
  form,
  disabled,
  onSubmit,
}: {
  form: {
    toolCallId: string;
    title: string;
    description: string | null;
    fields: Array<{
      name: string;
      label: string;
      type: "text" | "number" | "radio" | "textarea";
      options?: string[];
      placeholder?: string;
      required: boolean;
    }>;
  };
  disabled: boolean;
  onSubmit: (values: Record<string, string>, cancelled: boolean) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const submit = (cancelled: boolean) => {
    if (!cancelled && form.fields.some((field) => field.required && !(Object.hasOwn(values, field.name) ? values[field.name].trim() : ""))) return;
    onSubmit(values, cancelled);
  };
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange">Needs your input</p>
      <h3 className="mt-1 font-semibold text-ink">{form.title}</h3>
      {form.description && <p className="mt-1 text-sm text-ink-2">{form.description}</p>}
      <div className="mt-4 space-y-4">
        {form.fields.map((field) => (
          <label key={field.name} className="block text-sm font-medium text-ink">
            {field.label}{field.required ? " *" : ""}
            {field.type === "radio" ? (
              <select
                value={Object.hasOwn(values, field.name) ? values[field.name] : ""}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                className="mt-1 h-10 w-full rounded-control bg-field px-3 font-normal shadow-[inset_0_0_0_1px_var(--line)]"
              >
                <option value="">Select…</option>
                {field.options?.map((option) => <option key={option}>{option}</option>)}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                value={Object.hasOwn(values, field.name) ? values[field.name] : ""}
                placeholder={field.placeholder}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                className="mt-1 min-h-24 w-full rounded-control bg-field p-3 font-normal shadow-[inset_0_0_0_1px_var(--line)]"
              />
            ) : (
              <input
                type={field.type}
                value={Object.hasOwn(values, field.name) ? values[field.name] : ""}
                placeholder={field.placeholder}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                className="mt-1 h-10 w-full rounded-control bg-field px-3 font-normal shadow-[inset_0_0_0_1px_var(--line)]"
              />
            )}
          </label>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button disabled={disabled} onClick={() => submit(false)} className="rounded-control bg-ink px-4 py-2 text-sm text-canvas disabled:opacity-50">Continue</button>
        <button disabled={disabled} onClick={() => submit(true)} className="rounded-control border border-line px-4 py-2 text-sm text-ink-2 disabled:opacity-50">Cancel form</button>
      </div>
    </section>
  );
}

export function MigrationPreview({ developmentModel }: { developmentModel: boolean }) {
  const session = migrationAuthClient.useSession();
  const convexAuth = useConvexAuth();

  if (session.isPending || convexAuth.isLoading) {
    return <main className="grid min-h-screen place-items-center text-sm text-ink-2">Loading preview…</main>;
  }
  if (!session.data?.user) return <Login />;
  if (!convexAuth.isAuthenticated) {
    return <main className="grid min-h-screen place-items-center text-sm text-ink-2">Connecting secure session…</main>;
  }
  return (
    <AuthenticatedMigrationPreview
      key={session.data.user.id}
      developmentModel={developmentModel}
    />
  );
}

function AuthenticatedMigrationPreview({ developmentModel }: { developmentModel: boolean }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [modelAlias, setModelAlias] = useState<ModelAlias>("model-1");
  const [draft, setDraft] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [localError, setLocalError] = useState("");

  const conversations = usePaginatedQuery(api.migration.listConversations, {}, { initialNumItems: 30 });
  const conversation = useQuery(
    api.migration.getConversation,
    activeId ? { conversationId: activeId as Id<"migrationConversations"> } : "skip",
  );
  const history = usePaginatedQuery(
    api.migration.listConversationMessages,
    activeId ? { conversationId: activeId as Id<"migrationConversations"> } : "skip",
    { initialNumItems: 40 },
  );

  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    setMessages,
  } = useChat<MigrationMessage>({
    transport: migrationTransport,
    onFinish: ({ message }) => {
      const metadata = message.metadata;
      if (metadata?.conversationId) setActiveId(metadata.conversationId);
      setMessages([]);
    },
    onError: (chatError) => {
      try {
        const recovery = JSON.parse(chatError.message) as {
          error?: string;
          conversationId?: string;
          recovery?: string;
        };
        if (recovery.recovery === "open_saved_conversation" && recovery.conversationId) {
          setActiveId(recovery.conversationId);
          setLocalError(recovery.error ?? "Already submitted. Opened the saved conversation.");
        }
      } catch {
        setLocalError("The response failed. Reload the saved conversation before retrying.");
      }
    },
  });

  const streamedRunId = [...messages].reverse().find((message) => message.metadata?.runId)?.metadata?.runId;
  const { running, activeRunId } = migrationRunState(
    status,
    streamedRunId,
    conversation?.conversation,
  );
  const pendingForm = conversation?.forms.find((form) => form.status === "pending");
  const responseError = localError || error?.message ||
    (!running && conversation?.conversation.state === "error" ? "The response failed. Please retry." : "");
  const persistedMessages = [...history.results]
    .sort((left, right) => left.order - right.order || left.stepOrder - right.stepOrder);

  const sendQuestion = async (question: string) => {
    const normalized = question.trim();
    if (!normalized || running) return;
    setLocalError("");
    setLastQuestion(normalized);
    const requestBody: MigrationChatRequest = {
      kind: "question",
      requestId: crypto.randomUUID(),
      conversationId: activeId,
      expectedRevision: conversation?.conversation.revision ?? null,
      question: normalized,
      modelAlias,
    };
    setDraft("");
    await sendMessage({ text: normalized }, { body: requestBody });
  };

  const submitForm = async (values: Record<string, string>, cancelled: boolean) => {
    if (!activeId || !pendingForm || !conversation || running) return;
    const requestBody: MigrationChatRequest = {
      kind: "form",
      requestId: crypto.randomUUID(),
      conversationId: activeId,
      expectedRevision: conversation.conversation.revision,
      toolCallId: pendingForm.toolCallId,
      values,
      cancelled,
      modelAlias,
    };
    await sendMessage(
      { text: cancelled ? "Cancelled requested details" : "Submitted requested details" },
      { body: requestBody },
    );
  };

  const stopRun = async () => {
    if (activeRunId) {
      await fetch("/api/migration/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: activeRunId }),
      }).catch(() => undefined);
    }
    await stop();
  };

  return (
    <main className="flex min-h-screen bg-page text-ink">
      <aside className="hidden w-72 shrink-0 border-r border-line bg-sidebar p-4 md:block">
        <button onClick={() => { setActiveId(null); setMessages([]); }} className="w-full rounded-control bg-ink px-4 py-2 text-sm font-medium text-canvas">New conversation</button>
        <div className="mt-4 space-y-1">
          {conversations.results.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveId(item.id); setMessages([]); }}
              className={`w-full truncate rounded-control px-3 py-2 text-left text-sm ${activeId === item.id ? "bg-hover text-ink" : "text-ink-2 hover:bg-hover"}`}
            >
              {item.title}
            </button>
          ))}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange">Separate development preview</p>
            <p className="truncate text-sm text-ink-2">AI SDK + Convex with bundled tariff specialists and durable tool history</p>
          </div>
          {developmentModel && <span className="rounded-full bg-orange/10 px-2 py-1 text-xs text-orange">Development test model</span>}
          <select value={modelAlias} onChange={(event) => setModelAlias(event.target.value as ModelAlias)} disabled={running} className="rounded-control border border-line bg-surface px-2 py-1.5 text-sm">
            <option value="model-1">Model 1</option>
            <option value="model-2">Model 2</option>
          </select>
          <button onClick={() => void migrationAuthClient.signOut()} className="text-sm text-ink-2 hover:text-ink">Log out</button>
        </header>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 overflow-y-auto px-5 py-6">
          {persistedMessages.length === 0 && messages.length === 0 && (
            <div className="my-auto text-center">
              <h1 className="text-2xl font-semibold">Test the migration path</h1>
              <p className="mt-2 text-sm text-ink-2">Ask a maritime question with a missing voyage detail to exercise the persisted form flow.</p>
            </div>
          )}
          {persistedMessages.map((message) => (
            <article key={message.id} className={message.role === "user" ? "ml-auto max-w-[80%] rounded-card bg-hover px-4 py-3" : "max-w-[90%] whitespace-pre-wrap text-sm leading-6"}>
              {message.text}
            </article>
          ))}
          {messages.map((message) => {
            const text = textFromMessage(message);
            if (!text) return null;
            return <article key={message.id} className={message.role === "user" ? "ml-auto max-w-[80%] rounded-card bg-hover px-4 py-3" : "max-w-[90%] whitespace-pre-wrap text-sm leading-6"}>{text}</article>;
          })}
          {pendingForm && (
            <PendingForm
              key={`${activeId}:${pendingForm.id}`}
              form={pendingForm}
              disabled={running}
              onSubmit={submitForm}
            />
          )}
          {responseError && (
            <div role="alert" className="rounded-control border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {responseError}
              {lastQuestion && (conversation?.conversation.state === "error" || conversation?.conversation.state === "stopped") && (
                <button onClick={() => void sendQuestion(lastQuestion)} className="ml-3 font-semibold underline">Retry</button>
              )}
            </div>
          )}
        </div>

        <form
          onSubmit={(event) => { event.preventDefault(); void sendQuestion(draft); }}
          className="border-t border-line bg-surface p-4"
        >
          <div className="mx-auto flex max-w-3xl gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={running || Boolean(pendingForm)}
              placeholder={pendingForm ? "Resolve the pending form first" : "Ask about a voyage or port scenario"}
              className="min-h-12 flex-1 resize-none rounded-card bg-field px-4 py-3 text-sm shadow-[inset_0_0_0_1px_var(--line)] disabled:opacity-60"
            />
            {running ? (
              <button type="button" onClick={() => void stopRun()} className="rounded-control border border-line px-4 text-sm">Stop</button>
            ) : (
              <button type="submit" disabled={!draft.trim() || Boolean(pendingForm)} className="rounded-control bg-ink px-5 text-sm font-medium text-canvas disabled:opacity-40">Send</button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
