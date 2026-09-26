/** Port. El algoritmo concreto (argon2, bcrypt...) vive en infrastructure. */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}
