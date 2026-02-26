import type { AnyChunk, TaskUpdateChunk } from "@slack/web-api";

import {
  type AgentProjection,
  type AgentStream,
  type AgentStreamSink,
  createAgentStream,
  type StepState,
} from "@/lib/agent-stream";

// Minimal structural interface matching ChatStreamer from @slack/web-api
interface Streamer {
  append(args: {
    chunks?: AnyChunk[];
    markdown_text?: string;
  }): Promise<unknown>;
  stop(args?: { chunks?: AnyChunk[] }): Promise<unknown>;
}

function stepStateToChunk(state: StepState): TaskUpdateChunk {
  return {
    type: "task_update",
    id: state.id,
    title: state.title,
    status: state.status,
    details: state.details,
    output: state.output,
    sources: state.sources?.map((s) => ({
      type: "url",
      url: s.url,
      text: s.text,
    })),
  };
}

function createSlackSink(streamer: Streamer): AgentStreamSink {
  // Batches contiguous step/title chunks into a single append call,
  // flushing the batch whenever a markdown item interrupts the sequence.
  let chunkBatch: AnyChunk[] = [];

  const sendChunks = async () => {
    if (chunkBatch.length === 0) return;
    await streamer.append({ chunks: chunkBatch });
    chunkBatch = [];
  };

  return {
    async flushStep(state) {
      chunkBatch.push(stepStateToChunk(state));
    },
    async flushTitle(title) {
      chunkBatch.push({ type: "plan_update", title });
    },
    async flush() {
      await sendChunks();
    },
    async flushMarkdown(text) {
      await sendChunks();
      await streamer.append({ markdown_text: text });
    },
    async stop(steps, title) {
      await sendChunks();
      const chunks: AnyChunk[] = [
        ...steps.map(
          ({
            sources: _sources,
            details: _details,
            output: _output,
            ...state
          }) => stepStateToChunk({ ...state, sources: [] }),
        ),
        { type: "plan_update", title },
      ];
      await streamer.stop({ chunks });
    },
  };
}

export function createSlackAgentStream<T>(
  streamer: Streamer,
  projection: AgentProjection<T>,
): AgentStream<T> {
  return createAgentStream(createSlackSink(streamer), projection);
}
