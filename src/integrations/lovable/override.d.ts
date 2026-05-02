// Type override to fix auto-generated type mismatch
declare module "@lovable.dev/cloud-auth-js" {
  type OAuthProvider = "google" | "apple" | "microsoft";
  function createLovableAuth(): {
    signInWithOAuth(provider: OAuthProvider, opts?: {
      redirect_uri?: string;
      extraParams?: Record<string, string>;
    }): Promise<any>;
  };
}
