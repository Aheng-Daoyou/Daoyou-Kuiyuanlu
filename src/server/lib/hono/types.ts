import type { AuthUser } from '@server/lib/auth/types';
export type ActiveCultivatorRef = {
  userId: string;
  cultivatorId: string;
  status: 'active';
};

export type AppVariables = {
  user: AuthUser;
  activeCultivatorRef: ActiveCultivatorRef;
  llmConfig: {
    provider: string;
    apiKey: string;
    baseUrl: string | null;
    model: string;
    fastModel: string;
  };
  validatedJson: unknown;
  validatedQuery: unknown;
};

export type AppEnv = {
  Variables: Partial<AppVariables>;
};
