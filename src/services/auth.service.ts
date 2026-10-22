import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userRepository, UserRepository } from '../repositories/user.repository';
import { AppError } from '../utils/appError';
import { env } from '../config/env';
import { User } from '@prisma/client';

export type SafeUser = Omit<User, 'passwordHash'>;

export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: SafeUser;
  token: string;
}

export class AuthService {
  constructor(private userRepo: UserRepository = userRepository) {}

  private sanitizeUser(user: User): SafeUser {
    const { passwordHash: _hash, ...safeUser } = user;
    return safeUser;
  }

  private generateToken(user: User): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );
  }

  async register(dto: RegisterDTO): Promise<AuthResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existing = await this.userRepo.findByEmail(normalizedEmail);
    if (existing) {
      throw AppError.conflict('An account with this email already exists', 'DUPLICATE_EMAIL');
    }

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.userRepo.create({
      name: dto.name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  async login(dto: LoginDTO): Promise<AuthResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  async getUserById(id: string): Promise<SafeUser> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }
    return this.sanitizeUser(user);
  }
}

export const authService = new AuthService();
