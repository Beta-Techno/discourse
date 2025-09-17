export interface ModelAdapter {
  name: string;
  provider: string;
  
  chat(opts: {
    messages: any[];
    tools?: any[];
    onEvent: (ev: {
      type: 'token' | 'tool_call' | 'message' | 'done' | 'error';
      data: any;
    }) => void;
    toolChoice?: 'auto' | 'required' | { name: string };
    temperature?: number;
    maxSteps?: number;
  }): Promise<{ final: string }>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}
