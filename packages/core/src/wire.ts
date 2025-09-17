export type Provider = 'discord' | 'web' | 'sms' | 'gmail';

export interface AgentCreateRunRequest {
  prompt: string;
  profileId?: string;
  user: { provider: Provider; id: string };
  context?: { 
    channelId?: string; 
    threadId?: string; 
    replyToMessageId?: string; 
  };
}

export interface AgentCreateRunResponse {
  id: string;
  status: 'created';
  eventsUrl?: string;
}

export type RunEvent =
  | { type: 'plan'; data: { steps: string[]; profile: string } }
  | { type: 'tool_call'; data: { name?: string } }
  | { type: 'token'; data: { text: string } }
  | { type: 'message'; data: { content: string } }
  | { type: 'error'; data: { message: string } }
  | { type: 'done'; data: Record<string, never> }
  | { type: 'ping'; data: any };
