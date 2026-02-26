// ---- Public types ----

export interface StepSource {
  url: string;
  text: string;
}

export interface StepState {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "complete" | "error";
  details?: string;
  output?: string;
  sources?: StepSource[];
}

export interface Step {
  title(value: string): void;
  details(value: string): void;
  output(value: string): void;
  source(url: string, text?: string): void;
  complete(opts?: { title?: string; details?: string; output?: string }): void;
  error(opts?: { title?: string; output?: string }): void;
}

export interface AgentContext {
  setTitle(title: string): void;
  addStep(id: string, title: string): Step;
  getStep(id: string): Step | undefined;
  appendMarkdown(text: string): void;
}

export interface AgentStream<T> {
  consume(stream: AsyncIterable<T>): Promise<void>;
  stop(title?: string): Promise<void>;
}

export type AgentProjection<T> = (
  part: T,
  ctx: AgentContext,
) => void | Promise<void>;

// ---- Sink interface (implemented by platform adapters) ----

export interface AgentStreamSink {
  flushStep(state: StepState): Promise<void>;
  flushMarkdown(text: string): Promise<void>;
  flushTitle(title: string): Promise<void>;
  /** Called after all mutations for a stream item have been flushed. */
  flush(): Promise<void>;
  stop(steps: StepState[], title: string): Promise<void>;
}

// ---- Internal implementation ----

type Mutation =
  | { kind: "step"; state: StepState }
  | { kind: "markdown"; text: string }
  | { kind: "title"; title: string };

class InternalStep implements Step {
  state: StepState;
  private queue: Mutation[];

  constructor(id: string, title: string, queue: Mutation[]) {
    this.state = { id, title, status: "in_progress", sources: [] };
    this.queue = queue;
  }

  title(value: string): void {
    this.state.title = value;
    this.queue.push({ kind: "step", state: { ...this.state } });
  }

  details(value: string): void {
    this.state.details = value;
    this.queue.push({ kind: "step", state: { ...this.state } });
  }

  output(value: string): void {
    this.state.output = value;
    this.queue.push({ kind: "step", state: { ...this.state } });
  }

  source(url: string, text?: string): void {
    this.state.sources?.push({ url, text: text ?? url });
  }

  complete(
    opts: { title?: string; details?: string; output?: string } = {},
  ): void {
    if (opts.title !== undefined) this.state.title = opts.title;
    if (opts.details !== undefined) this.state.details = opts.details;
    if (opts.output !== undefined) this.state.output = opts.output;
    this.state.status = "complete";
    this.queue.push({
      kind: "step",
      state: { ...this.state, sources: this.state.sources?.slice() },
    });
  }

  error(opts: { title?: string; output?: string } = {}): void {
    if (opts.title !== undefined) this.state.title = opts.title;
    if (opts.output !== undefined) this.state.output = opts.output;
    this.state.status = "error";
    this.queue.push({ kind: "step", state: { ...this.state } });
  }
}

export function createAgentStream<T>(
  sink: AgentStreamSink,
  projection: AgentProjection<T>,
): AgentStream<T> {
  const steps = new Map<string, InternalStep>();
  const queue: Mutation[] = [];

  const ctx: AgentContext = {
    setTitle(title) {
      queue.push({ kind: "title", title });
    },
    addStep(id, title) {
      const existing = steps.get(id);
      if (existing) return existing;
      const step = new InternalStep(id, title, queue);
      steps.set(id, step);
      queue.push({ kind: "step", state: { ...step.state } });
      return step;
    },
    getStep(id) {
      return steps.get(id);
    },
    appendMarkdown(text) {
      queue.push({ kind: "markdown", text });
    },
  };

  async function flush(): Promise<void> {
    if (queue.length === 0) return;
    const mutations = queue.splice(0);
    for (const mutation of mutations) {
      if (mutation.kind === "step") {
        await sink.flushStep(mutation.state);
      } else if (mutation.kind === "markdown") {
        await sink.flushMarkdown(mutation.text);
      } else {
        await sink.flushTitle(mutation.title);
      }
    }
    await sink.flush();
  }

  return {
    async consume(stream) {
      for await (const part of stream) {
        await projection(part, ctx);
        await flush();
      }
    },

    async stop(title = "Completed") {
      const allSteps = [...steps.values()].map((s) => s.state);
      await sink.stop(allSteps, title);
    },
  };
}
