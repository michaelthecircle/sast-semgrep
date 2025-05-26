export interface GitHubWebhookPayload {
  action: string;
  repository: {
    name: string;
    full_name: string;
    private: boolean;
    owner: {
      login: string;
    };
  };
  pull_request?: {
    number: number;
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
      sha: string;
    };
  };
  commits?: Array<{
    id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
    };
  }>;
} 