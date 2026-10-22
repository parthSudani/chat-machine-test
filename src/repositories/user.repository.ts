import { prisma } from '../config/prisma';
import { User } from '@prisma/client';

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
}

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async findManyByIds(ids: string[]): Promise<User[]> {
    return prisma.user.findMany({
      where: { id: { in: ids } },
    });
  }

  async create(data: CreateUserData): Promise<User> {
    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
      },
    });
  }
}

export const userRepository = new UserRepository();
