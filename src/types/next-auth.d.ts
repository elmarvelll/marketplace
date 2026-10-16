// Session/JWT shape for the standalone Marketplace. `id` is the AkadVerse User.id; isAdmin is AkadVerse's User.isAdmin.
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      firstName: string;
      isAdmin: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    firstName: string;
    isAdmin: boolean;
    // marketplace.AccountState.sessionVersion at sign-in; a mismatch means the session was revoked.
    sv: number;
  }
}
