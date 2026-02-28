/**
 * Small TypeScript fixture for integration testing.
 * Includes one interface, one class, and one standalone function.
 */

export interface UserRecord {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

export class UserDirectory {
  private users: Map<number, UserRecord> = new Map();
  private nextId = 1;
  constructor(private readonly maxUsers: number = 100) {}

  // Registers a user record and returns the stored object.
  // Used by tests that need predictable class and method symbols.
  addUser(name: string, email: string): UserRecord {
    if (this.users.size >= this.maxUsers) {
      throw new Error("Directory capacity reached");
    }

    const user: UserRecord = {
      id: this.nextId++,
      name,
      email,
      active: true,
    };
    this.users.set(user.id, user);
    return user;
  }

  getUser(id: number): UserRecord | undefined {
    return this.users.get(id);
  }
}

// Creates a small pre-populated directory for smoke-style reads.
// The object shape is intentionally simple and deterministic.
// Helpful for deterministic parser and map snapshots in tests.
// Maintains ~50 lines to exercise non-truncated read behavior.
// This keeps fixture size stable for truncation-threshold coverage.
export function createDemoDirectory(): UserDirectory {
  const directory = new UserDirectory(500);
  directory.addUser("Ada Lovelace", "ada@example.com");
  return directory;
}