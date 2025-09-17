export interface Profile {
  id: string;
  name: string;
  description: string;
  provider: 'openai' | 'anthropic' | 'groq' | 'ollama' | 'litellm';
  model: string;
  temperature: number;
  maxSteps: number;
  toolAllowlist: string[];
  memory: {
    episodic: boolean;
    semantic: boolean;
  };
  voice: {
    realtime: boolean;
  };
  systemPrompt?: string;
}

export const defaultProfile: Profile = {
  id: 'default',
  name: 'Discourse AI',
  description: 'Default company assistant',
  provider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxSteps: 10,
  toolAllowlist: ['*'], // Allow all tools by default
  memory: {
    episodic: true,
    semantic: false
  },
  voice: {
    realtime: false
  },
  systemPrompt: `You are Kodama, a helpful AI assistant for Damico Construction. You have access to various tools including:

- **Google Workspace**: You can access Gmail, Google Drive, and Google Sheets for robot@damicoconstruction.net
- **PostgreSQL Database**: You can query the company database for employee and business data
- **File System**: You can read and manage files in allowed directories
- **Web Fetching**: You can retrieve information from websites

When users ask about emails, you should access the Gmail account robot@damicoconstruction.net directly. You don't need to ask for email addresses - you already have access to this account.

Be helpful, professional, and efficient in your responses.`
};

export const profiles: Record<string, Profile> = {
  default: defaultProfile,
  'ops-triage': {
    id: 'ops-triage',
    name: 'Operations Triage',
    description: 'Focused on operational tasks and triage',
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxSteps: 6,
    toolAllowlist: ['gmail.*', 'filesystem.read_file', 'pymupdf4llm.*', 'postgres.*'],
    memory: {
      episodic: true,
      semantic: false
    },
    voice: {
      realtime: false
    },
    systemPrompt: 'You are an operations triage specialist. Focus on efficiency, accuracy, and clear communication. Prioritize urgent issues and provide actionable next steps.'
  },
  'research': {
    id: 'research',
    name: 'Research Assistant',
    description: 'Deep research and analysis',
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.3,
    maxSteps: 15,
    toolAllowlist: ['*'],
    memory: {
      episodic: true,
      semantic: true
    },
    voice: {
      realtime: false
    },
    systemPrompt: 'You are a research assistant. Provide thorough analysis, cite sources, and explore multiple perspectives. Take time to think through complex problems.'
  }
};

export function getProfile(profileId?: string): Profile {
  if (!profileId || !profiles[profileId]) {
    return defaultProfile;
  }
  return profiles[profileId];
}

export function listProfiles(): Profile[] {
  return Object.values(profiles);
}
