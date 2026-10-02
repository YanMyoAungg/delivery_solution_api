import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DatabaseService } from '../common/database/database.service.js';
import { currentDateInTimezone, localDateRange } from '../common/utils/local-date.util.js';
import { deliveryAttemptHistory, deliveryAttempts } from './delivery.schema.js';
import { orders } from '../orders/order.schema.js';
import { townships } from '../townships/township.schema.js';
import { riders } from '../riders/rider.schema.js';
import { users } from '../users/user.schema.js';
import { OfficeDashboardResponseDto } from './dto/office-dashboard-response.dto.js';

const RECENT_ACTIVITY_LIMIT = 20;
const FAILED_ORDERS_LIMIT = 20;
const newRider = alias(riders, 'new_rider');
const previousRider = alias(riders, 'previous_rider');
const newUser = alias(users, 'new_user');
const previousUser = alias(users, 'previous_user');

@Injectable()
export class OfficeDashboardService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async getDashboard(requestedDate?: string): Promise<OfficeDashboardResponseDto> {
    const timezone = this.config.get<string>('APP_TIMEZONE') ?? 'Asia/Yangon';
    const date = requestedDate ?? currentDateInTimezone(timezone);
    const db = this.database.db;

    const [ordersCreated, openRows, completedRows, activityRows, failedRows] =
      await Promise.all([
        db.select({ count: sql<number>`count(*)` })
          .from(orders)
          .where(localDateRange(orders.createdAt, date, timezone)),
        db.select({
          orderId: orders.id,
          riderId: riders.id,
          riderName: users.name,
          townshipId: townships.id,
          townshipName: townships.name,
        })
          .from(deliveryAttempts)
          .innerJoin(orders, eq(orders.id, deliveryAttempts.orderId))
          .innerJoin(riders, eq(riders.id, deliveryAttempts.riderId))
          .innerJoin(users, eq(users.id, riders.userId))
          .innerJoin(townships, eq(townships.id, orders.townshipId))
          .where(and(
            eq(deliveryAttempts.status, 'ASSIGNED'),
            sql`${deliveryAttempts.attemptNumber} = (select max(latest_attempt.attempt_number) from delivery_attempts latest_attempt where latest_attempt.order_id = ${deliveryAttempts.orderId})`,
          )),
        db.select({
          orderId: deliveryAttempts.orderId,
          attemptNumber: deliveryAttempts.attemptNumber,
          status: deliveryAttempts.status,
        })
          .from(deliveryAttempts)
          .where(or(
            and(eq(deliveryAttempts.status, 'DELIVERED'), localDateRange(deliveryAttempts.deliveredAt, date, timezone)),
            and(eq(deliveryAttempts.status, 'FAILED'), localDateRange(deliveryAttempts.failedAt, date, timezone)),
          ))
          .orderBy(desc(deliveryAttempts.attemptNumber)),
        db.select({
          id: deliveryAttemptHistory.id,
          orderId: orders.id,
          trackingCode: orders.trackingCode,
          townshipName: townships.name,
          riderName: sql<string | null>`case when ${deliveryAttemptHistory.newRiderId} is not null then ${newUser.name} else ${previousUser.name} end`,
          previousRiderName: sql<string | null>`${previousUser.name}`,
          previousRiderId: deliveryAttemptHistory.previousRiderId,
          newRiderId: deliveryAttemptHistory.newRiderId,
          event: deliveryAttemptHistory.event,
          createdAt: deliveryAttemptHistory.createdAt,
        })
          .from(deliveryAttemptHistory)
          .innerJoin(deliveryAttempts, eq(deliveryAttempts.id, deliveryAttemptHistory.deliveryAttemptId))
          .innerJoin(orders, eq(orders.id, deliveryAttempts.orderId))
          .innerJoin(townships, eq(townships.id, orders.townshipId))
          .leftJoin(newRider, eq(newRider.id, deliveryAttemptHistory.newRiderId))
          .leftJoin(newUser, eq(newUser.id, newRider.userId))
          .leftJoin(previousRider, eq(previousRider.id, deliveryAttemptHistory.previousRiderId))
          .leftJoin(previousUser, eq(previousUser.id, previousRider.userId))
          .where(localDateRange(deliveryAttemptHistory.createdAt, date, timezone))
          .orderBy(desc(deliveryAttemptHistory.createdAt))
          .limit(RECENT_ACTIVITY_LIMIT),
        db.select({
          orderId: orders.id,
          trackingCode: orders.trackingCode,
          townshipName: townships.name,
          riderName: users.name,
          attemptNumber: deliveryAttempts.attemptNumber,
          failedAt: deliveryAttempts.failedAt,
          orderStatus: orders.status,
        })
          .from(deliveryAttempts)
          .innerJoin(orders, eq(orders.id, deliveryAttempts.orderId))
          .innerJoin(townships, eq(townships.id, orders.townshipId))
          .leftJoin(riders, eq(riders.id, deliveryAttempts.riderId))
          .leftJoin(users, eq(users.id, riders.userId))
          .where(and(
            eq(deliveryAttempts.status, 'FAILED'),
            eq(orders.status, 'FAILED'),
            sql`${deliveryAttempts.attemptNumber} < 3`,
            sql`${deliveryAttempts.attemptNumber} = (select max(latest_attempt.attempt_number) from delivery_attempts latest_attempt where latest_attempt.order_id = ${deliveryAttempts.orderId})`,
            isNotNull(deliveryAttempts.failedAt),
          ))
          .orderBy(desc(deliveryAttempts.failedAt))
          .limit(FAILED_ORDERS_LIMIT),
      ]);

    const latestAssignedByOrder = new Map<string, (typeof openRows)[number]>();
    for (const row of openRows) {
      if (!latestAssignedByOrder.has(row.orderId)) {
        latestAssignedByOrder.set(row.orderId, row);
      }
    }
    const openWorkCounts = new Map<string, {
      riderId: string;
      riderName: string;
      townshipId: string;
      townshipName: string;
      count: number;
    }>();
    for (const row of latestAssignedByOrder.values()) {
      const key = `${row.riderId}:${row.townshipId}`;
      const group = openWorkCounts.get(key);
      if (group) group.count += 1;
      else openWorkCounts.set(key, {
        riderId: row.riderId,
        riderName: row.riderName,
        townshipId: row.townshipId,
        townshipName: row.townshipName,
        count: 1,
      });
    }

    const delivered = completedRows.filter((row) => row.status === 'DELIVERED').length;
    const failed = completedRows.filter((row) => row.status === 'FAILED').length;
    const completed = delivered + failed;

    return {
      date,
      summary: {
        ordersCreated: Number(ordersCreated[0]?.count ?? 0),
        openAssignments: latestAssignedByOrder.size,
        delivered,
        failed,
        successRate: completed === 0 ? 0 : Number(((delivered / completed) * 100).toFixed(2)),
      },
      openWork: [...openWorkCounts.values()].sort((left, right) =>
        left.townshipName.localeCompare(right.townshipName) || left.riderName.localeCompare(right.riderName),
      ),
      recentActivity: activityRows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        trackingCode: row.trackingCode,
        townshipName: row.townshipName,
        riderName: row.riderName ?? null,
        previousRiderName: row.previousRiderName ?? null,
        event: row.event,
        createdAt: row.createdAt.toISOString(),
      })),
      failedOrders: failedRows.map((row) => ({
        orderId: row.orderId,
        trackingCode: row.trackingCode,
        townshipName: row.townshipName,
        riderName: row.riderName ?? null,
        attemptNumber: row.attemptNumber,
        failedAt: row.failedAt?.toISOString() ?? '',
      })),
    };
  }
}
