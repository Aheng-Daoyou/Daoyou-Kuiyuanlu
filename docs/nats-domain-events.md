# NATS JetStream 领域事件运行手册

## 运行模型

- `DAOYOU_DOMAIN_EVENTS` 使用文件持久化和 Limits retention，保存 `daoyou.domain.>` 事件 14 天，最大占用 3 GiB。
- `DAOYOU_DOMAIN_EVENT_DLQ` 保存终止失败消息 30 天，最大占用 1 GiB。
- 应用启动时以幂等方式校验并创建 Stream 和 durable consumer。
- 业务事务将待发布消息写入通用 PostgreSQL 事务消息表 `wanjiedaoyou_transactional_messages`；领域事件只是当前消息类型之一。
- 事务消息表只保存通用的 `message_key`、`destination`、`payload` 与发布状态，不持有 aggregate、event type 等领域事件专属列。
- 收到 JetStream PubAck 后标记 `published_at`；此后消息的持久化、投递状态、重试与消费进度由 JetStream 负责。
- 消费者在同一 PostgreSQL 事务中写入通用消费幂等记录并更新业务数据，提交后才 ACK JetStream。
- 单条事件处理失败 10 次后转入 DLQ；DLQ 发布失败时继续重试原事件。

`wanjiedaoyou_local_transaction_messages` 是 BullMQ 时代“本地执行消息”的旧模型。迁移只对它添加 deprecated 数据库注释，不删除、不改列，也不再产生新写入。后续应在确认历史数据无保留价值后使用独立迁移清理。

## 当前事件

| 事件 | Subject | 消费者 |
| --- | --- | --- |
| `sect.construction.donated` | `daoyou.domain.sect.construction-donated.v1` | `sect-facility-projector-v1` |
| `alchemy.craft.completed` | `daoyou.domain.activity.alchemy-craft-completed.v1` | `task-projector-v1` |
| `ranking.challenge.completed` | `daoyou.domain.activity.ranking-challenge-completed.v1` | `task-projector-v1` |
| `dungeon.run.settled` | `daoyou.domain.activity.dungeon-run-settled.v1` | `task-projector-v1` |

## 必需环境变量

```dotenv
NATS_SERVERS=nats://nats-host:4222
NATS_USER=app
NATS_PASSWORD=replace-with-production-secret
```

多个 NATS 地址使用逗号分隔。不要把生产密码写入仓库或 URL；通过运行环境的 secret/env 文件注入。

## 停机硬切部署顺序

1. 停止旧应用，确保不会再产生 BullMQ 消息。
2. 确认旧 BullMQ 队列已经处理完需要保留的作业。
3. 在生产 env 文件中配置全部 `NATS_*` 变量。
4. 执行 `bunx drizzle-kit migrate`。迁移会新增通用事务消息表和消费幂等表，并把旧 `wanjiedaoyou_local_transaction_messages` 标记为 deprecated；不会删除旧表或旧数据。
5. 启动新应用；启动成功意味着 NATS 连接、Stream 和 consumer 初始化成功。
6. 检查 `/api/health-check` 返回 `redis: up` 和 `nats: up`。
7. 检查 NATS `8222` 监控端点与应用日志，确认无 Outbox/consumer 错误。

## 本地 NATS

```bash
docker compose -f docker-compose.nats.yml up -d
docker compose -f docker-compose.nats.yml ps
```

开发容器凭据在 `.env.example` 中。停止容器不会删除 JetStream volume；需要重置本地事件时应显式删除 `nats-data` volume。

## 故障检查

- 事务消息积压：查询 `wanjiedaoyou_transactional_messages` 中 `published_at IS NULL` 的数量、最早 `created_at` 和 `last_publish_error`。
- Consumer 积压：查看 JetStream consumer 的 `num_pending`、 `num_ack_pending` 和 `num_redelivered`。
- 毒消息：查看 `DAOYOU_DOMAIN_EVENT_DLQ`，subject 为 `daoyou.dead-letter.<consumer-name>`。
- 手工重放前必须确认 `wanjiedaoyou_message_consumptions` 中对应消费记录是否仍存在；消费记录保留 30 天，长于主 Stream 的 14 天保留期。

## 事件演进规则

- 事件名称使用已发生事实的过去式，不使用 `apply`、`update`、`process` 等命令式名称。
- 不兼容 payload 变更必须创建新的事件版本和 subject，旧版本消费者独立退役。
- 新事件在业务数据的同一 PostgreSQL 事务中写入通用事务消息表。
- 消费者必须写入通用消费幂等记录，禁止只依赖 JetStream 去重。原因是 PostgreSQL 提交成功但 ACK 未到达 NATS 时仍会发生合法重投。
- NATS 消息携带完整事件，不发布数据库记录指针。
