import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id?: string
      name?: string | null
      email?: string | null
      username?: string
      role?: string
    }
  }

  interface User {
    username?: string
    role?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string
    username?: string
    role?: string
  }
}