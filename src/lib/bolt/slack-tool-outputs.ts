export interface SendMessageOutput {
  message_link: string;
  message_context: { message_ts: string; channel_id: string };
}

export interface SendMessageDraftOutput {
  channel_link: string;
  widget_id: string;
  channel_info: { channel_id: string; name: string; is_dm: boolean };
  result: string;
}

export interface ScheduleMessageOutput {
  message_link: string;
  message_context: { message_ts: string; channel_id: string };
}

export interface CreateCanvasOutput {
  canvas_id: string;
  canvas_url: string;
}

export interface ReadCanvasOutput {
  canvas_id: string;
  markdown_content: string;
  section_id_mapping: Record<string, string>;
}

export interface ReadMessagesOutput {
  messages: string;
  pagination_info: string;
}

export interface ReadUserProfileOutput {
  result: string;
}

export interface SearchResultsOutput {
  results: string;
  pagination_info: string;
}
