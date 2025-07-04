/**
 * @interface User
 * @summary User profile interface
 * @description Defines the structure of a user object within the system.
 * This interface is used across the application to ensure type consistency for user data.
 * It includes basic identification, authentication, and metadata.
 * @property {string} id - Unique identifier for the user.
 * @property {string} email - The user's email address (must be unique).
 * @property {string} name - The user's display name.
 * @property {string[]} roles - An array of roles assigned to the user (e.g., 'admin', 'user').
 * @property {Date} createdAt - Timestamp indicating when the user account was created.
 * @property {Date} updatedAt - Timestamp indicating the last time the user account was updated.
 *
 * @example
 * ```typescript
 * const newUser: User = {
 *   id: 'user_123',
 *   email: 'test@example.com',
 *   name: 'Test User',
 *   roles: ['user'],
 *   createdAt: new Date(),
 *   updatedAt: new Date()
 * };
 * ```
 */
export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @class UserService
 * @summary Manages user data and operations.
 * @description This class provides a set of asynchronous methods for performing CRUD operations on user entities.
 * It acts as a data access layer for user-related business logic, abstracting the underlying data storage.
 * All operations return Promises to handle asynchronous data retrieval and manipulation.
 */
export class UserService {
  private users: Map<string, User> = new Map(); // In-memory store for demonstration

  /**
   * @method createUser
   * @summary Creates a new user record.
   * @description Adds a new user to the system with a unique ID, email, name, and optional roles.
   * A timestamp for creation and last update is automatically generated.
   * @param {string} email - The user's email address.
   * @param {string} name - The user's full name.
   * @param {string[]} [roles=['user']] - An array of roles for the user (defaults to 'user').
   * @returns {Promise<User>} A promise that resolves to the newly created user object.
   *
   * @example
   * ```typescript
   * const userService = new UserService();
   * userService.createUser('john.doe@example.com', 'John Doe', ['admin', 'user'])
   *   .then(user => console.log('User created:', user.name, user.email));
   * ```
   */
  async createUser(email: string, name: string, roles: string[] = ['user']): Promise<User> {
    const user: User = {
      id: this.generateId(),
      email,
      name,
      roles,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  /**
   * @method getUserById
   * @summary Retrieves a user by their unique ID.
   * @description Fetches a user object from the store based on the provided ID.
   * Returns null if no user is found with the given ID.
   * @param {string} id - The unique ID of the user to retrieve.
   * @returns {Promise<User | null>} A promise that resolves to the user object if found, otherwise null.
   *
   * @example
   * ```typescript
   * const userService = new UserService();
   * userService.createUser('jane.doe@example.com', 'Jane Doe')
   *   .then(createdUser => {
   *     userService.getUserById(createdUser.id)
   *       .then(user => {
   *         if (user) console.log('Found user:', user.name);
   *         else console.log('User not found.');
   *       });
   *   });
   * ```
   */
  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  /**
   * @method updateUser
   * @summary Updates an existing user's information.
   * @description Modifies a user record identified by ID with the provided partial updates.
   * The `updatedAt` timestamp is automatically refreshed.
   * Returns null if the user is not found.
   * @param {string} id - The unique ID of the user to update.
   * @param {Partial<User>} updates - An object containing the fields to update.
   * @returns {Promise<User | null>} A promise that resolves to the updated user object if found, otherwise null.
   *
   * @example
   * ```typescript
   * const userService = new UserService();
   * userService.createUser('alice@example.com', 'Alice')
   *   .then(user => {
   *     userService.updateUser(user.id, { name: 'Alice Smith', roles: ['editor'] })
   *       .then(updatedUser => {
   *         if (updatedUser) console.log('User updated:', updatedUser.name, updatedUser.roles);
   *       });
   *   });
   * ```
   */
  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;

    const updatedUser = {
      ...user,
      ...updates,
      id: user.id, // Ensure ID is not changed
      updatedAt: new Date(),
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  /**
   * @method deleteUser
   * @summary Deletes a user record by ID.
   * @description Removes a user from the system based on their unique ID.
   * @param {string} id - The unique ID of the user to delete.
   * @returns {Promise<boolean>} A promise that resolves to true if the user was successfully deleted, false otherwise.
   *
   * @example
   * ```typescript
   * const userService = new UserService();
   * userService.createUser('bob@example.com', 'Bob')
   *   .then(user => {
   *     userService.deleteUser(user.id)
   *       .then(success => {
   *         console.log('User deleted:', success); // true or false
   *       });
   *   });
   * ```
   */
  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  /**
   * @method generateId
   * @summary Generates a unique user ID.
   * @description Creates a simple unique ID string for new users,
   * combining a timestamp and a random alphanumeric suffix.
   * @returns {string} A unique user ID.
   * @private
   */
  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * @function validateEmail
 * @summary Validates an email address format.
 * @description Checks if the provided string adheres to a standard email format using a regular expression.
 * This function performs a basic syntax validation, not an existence or deliverability check.
 * @param {string} email - The email string to validate.
 * @returns {boolean} True if the email format is valid, false otherwise.
 *
 * @example
 * ```typescript
 * const isValid = validateEmail('test@example.com'); // true
 * const isInvalid = validateEmail('invalid-email'); // false
 * console.log('Email validation result:', isValid);
 * ```
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * @function authenticateUser
 * @summary Authenticates a user with email and password.
 * @description Attempts to authenticate a user by validating their email format and password strength,
 * then performing a dummy lookup via `UserService`.
 * This is a simplified authentication flow for demonstration purposes;
 * a real-world scenario would involve password hashing and database lookups.
 * @param {string} email - The user's email for authentication.
 * @param {string} password - The user's password.
 * @param {UserService} userService - An instance of `UserService` to perform user lookups.
 * @returns {Promise<{ success: boolean; user?: User; error?: string }>} A promise that resolves to an object indicating
 * success or failure, potentially with a `User` object or an `error` message.
 * @throws {Error} Throws an error if the user service operation fails.
 *
 * @example
 * ```typescript
 * const myUserService = new UserService();
 * // Assuming a user exists or is created:
 * myUserService.createUser('user@example.com', 'Example User', ['user'])
 *   .then(() => {
 *     authenticateUser('user@example.com', 'secure_password', myUserService)
 *       .then(result => {
 *         if (result.success) {
 *           console.log('Authentication successful for user:', result.user?.name);
 *         } else {
 *           console.error('Authentication failed:', result.error);
 *         }
 *       });
 *   });
 * ```
 */
export async function authenticateUser(
  email: string,
  password: string,
  userService: UserService,
): Promise<{ success: boolean; user?: User; error?: string }> {
  if (!validateEmail(email)) {
    return { success: false, error: 'Invalid email format' };
  }

  // Dummy lookup to simulate user retrieval
  // In a real app, you'd fetch by email and validate password securely
  const users = await userService.getUserById('dummy-lookup'); // This will always return null in current UserService
  if (!users) {
    // Simulate finding a user for the example to proceed
    const foundUser: User = {
      id: 'mock_user_id',
      email: email,
      name: 'Mock User',
      roles: ['user'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (password.length < 8) {
      return { success: false, error: 'Invalid password: must be at least 8 characters' };
    }
    return { success: true, user: foundUser };
  }

  if (password.length < 8) {
    return { success: false, error: 'Invalid password: must be at least 8 characters' };
  }

  return { success: true, user: users };
}

