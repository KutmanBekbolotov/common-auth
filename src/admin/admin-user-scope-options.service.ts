import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ScopeOptionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_SCOPE_OPTIONS } from './user-scope-options';

type ScopeFieldName = 'orgId' | 'departmentId';

type ScopeOptionItem = {
  id: string;
  type: ScopeOptionType;
  value: string;
};

@Injectable()
export class AdminUserScopeOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listScopeOptions() {
    await this.ensureDefaultScopeOptions();

    const items = await this.prisma.scopeOption.findMany({
      orderBy: [{ type: 'asc' }, { value: 'asc' }],
    });

    return this.toScopeOptionsResponse(items);
  }

  async createScopeOption(type: ScopeOptionType, value: string) {
    await this.ensureDefaultScopeOptions();

    const normalizedValue = this.normalizeRequiredValue(value);

    try {
      const item = await this.prisma.scopeOption.create({
        data: {
          type,
          value: normalizedValue,
        },
      });

      return {
        item: this.toScopeOptionItem(item),
      };
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  async updateScopeOption(id: string, value: string) {
    await this.ensureDefaultScopeOptions();

    const normalizedValue = this.normalizeRequiredValue(value);

    const item = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.scopeOption.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new NotFoundException('Scope option not found');
      }

      if (existing.value === normalizedValue) {
        return existing;
      }

      try {
        const updated = await tx.scopeOption.update({
          where: { id },
          data: {
            value: normalizedValue,
          },
        });

        if (existing.type === ScopeOptionType.orgId) {
          await tx.user.updateMany({
            where: { orgId: existing.value },
            data: { orgId: normalizedValue },
          });
        } else {
          await tx.user.updateMany({
            where: { departmentId: existing.value },
            data: { departmentId: normalizedValue },
          });
        }

        return updated;
      } catch (error) {
        this.handleUniqueConstraint(error);
        throw error;
      }
    });

    return {
      item: this.toScopeOptionItem(item),
    };
  }

  async deleteScopeOption(id: string) {
    await this.ensureDefaultScopeOptions();

    const existing = await this.prisma.scopeOption.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Scope option not found');
    }

    const isAssigned = await this.isScopeOptionAssigned(
      existing.type,
      existing.value,
    );

    if (isAssigned) {
      throw new ConflictException(
        'Scope option is assigned to existing users and cannot be deleted',
      );
    }

    await this.prisma.scopeOption.delete({
      where: { id },
    });

    return { success: true };
  }

  async assertScopeOptionExists(
    fieldName: ScopeFieldName,
    value: string | null | undefined,
  ) {
    if (!value) {
      return;
    }

    await this.ensureDefaultScopeOptions();

    const type =
      fieldName === 'orgId'
        ? ScopeOptionType.orgId
        : ScopeOptionType.departmentId;

    const existing = await this.prisma.scopeOption.findUnique({
      where: {
        type_value: {
          type,
          value,
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return;
    }

    const availableValues = await this.listScopeOptionValues(type);

    throw new BadRequestException(
      `${fieldName} must be one of: ${availableValues.join(', ')}`,
    );
  }

  private async ensureDefaultScopeOptions() {
    const count = await this.prisma.scopeOption.count();

    if (count > 0) {
      return;
    }

    await this.prisma.scopeOption.createMany({
      data: DEFAULT_SCOPE_OPTIONS,
      skipDuplicates: true,
    });
  }

  private async listScopeOptionValues(type: ScopeOptionType) {
    const items = await this.prisma.scopeOption.findMany({
      where: { type },
      orderBy: { value: 'asc' },
      select: { value: true },
    });

    return items.map((item) => item.value);
  }

  private async isScopeOptionAssigned(type: ScopeOptionType, value: string) {
    const count =
      type === ScopeOptionType.orgId
        ? await this.prisma.user.count({ where: { orgId: value } })
        : await this.prisma.user.count({ where: { departmentId: value } });

    return count > 0;
  }

  private normalizeRequiredValue(value: string) {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      throw new BadRequestException('value is required');
    }

    return normalizedValue;
  }

  private toScopeOptionsResponse(items: ScopeOptionItem[]) {
    const orgIds: string[] = [];
    const departmentIds: string[] = [];

    for (const item of items) {
      if (item.type === ScopeOptionType.orgId) {
        orgIds.push(item.value);
        continue;
      }

      departmentIds.push(item.value);
    }

    return {
      items: items.map((item) => this.toScopeOptionItem(item)),
      orgIds,
      departmentIds,
    };
  }

  private toScopeOptionItem(item: ScopeOptionItem) {
    return {
      id: item.id,
      type: item.type,
      value: item.value,
    };
  }

  private handleUniqueConstraint(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Scope option with this type and value already exists',
      );
    }
  }
}
