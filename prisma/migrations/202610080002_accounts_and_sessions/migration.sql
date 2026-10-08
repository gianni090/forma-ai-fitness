-- DropIndex
DROP INDEX "Exercise_name_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activeProgramId" TEXT,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Спортсмен',
ADD COLUMN     "questionnaire" JSONB,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
ADD COLUMN     "weeklyGoal" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PlanWorkout" ADD COLUMN     "focus" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "PlanExercise" ADD COLUMN     "metric" TEXT NOT NULL DEFAULT 'reps',
ADD COLUMN     "muscleGroup" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "notes" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "SessionExercise" ADD COLUMN     "metric" TEXT NOT NULL DEFAULT 'reps',
ADD COLUMN     "muscleGroup" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "notes" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "restSeconds" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "targetReps" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "targetSets" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SetLog" ADD COLUMN     "clientKey" TEXT,
ADD COLUMN     "durationSeconds" INTEGER;

-- AlterTable
ALTER TABLE "AiRun" ADD COLUMN     "programId" TEXT,
ADD COLUMN     "requestKey" TEXT;

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_name_equipment_key" ON "Exercise"("name", "equipment");

-- CreateIndex
CREATE UNIQUE INDEX "SetLog_sessionExerciseId_clientKey_key" ON "SetLog"("sessionExerciseId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "AiRun_requestKey_key" ON "AiRun"("requestKey");


-- Preserve legacy workout titles and targets as session snapshots.
UPDATE "WorkoutSession" AS s SET "title" = w."title"
FROM "PlanWorkout" AS w WHERE s."planWorkoutId" = w."id";
UPDATE "PlanExercise" AS p SET "muscleGroup" = e."muscleGroup"
FROM "Exercise" AS e WHERE p."exerciseId" = e."id";
UPDATE "PlanExercise" AS p SET "metric" = 'seconds', "targetReps" = regexp_replace(p."targetReps", '[^0-9–-]', '', 'g')
FROM "Exercise" AS e WHERE p."exerciseId" = e."id"
AND (p."targetReps" ~* 'сек' OR e."name" = 'Планка')
AND p."targetReps" ~ '[0-9]';
UPDATE "SessionExercise" AS s SET "targetSets" = p."targetSets", "targetReps" = p."targetReps", "restSeconds" = p."restSeconds", "metric" = p."metric", "notes" = p."notes", "muscleGroup" = p."muscleGroup"
FROM "WorkoutSession" AS w, "PlanExercise" AS p
WHERE s."sessionId" = w."id" AND p."planWorkoutId" = w."planWorkoutId" AND p."exerciseId" = s."exerciseId";
UPDATE "SetLog" AS l SET "durationSeconds" = l."reps", "reps" = 0
FROM "SessionExercise" AS s WHERE l."sessionExerciseId" = s."id" AND s."metric" = 'seconds' AND l."weight" = 0 AND l."reps" > 0;
UPDATE "User" AS u SET "activeProgramId" = (SELECT p."id" FROM "Program" AS p WHERE p."userId" = u."id" ORDER BY p."createdAt" DESC LIMIT 1);
CREATE INDEX "Program_userId_createdAt_idx" ON "Program"("userId", "createdAt");
CREATE INDEX "WorkoutSession_userId_startedAt_idx" ON "WorkoutSession"("userId", "startedAt");
CREATE INDEX "PlanWorkout_programId_dayOfWeek_idx" ON "PlanWorkout"("programId", "dayOfWeek");
CREATE INDEX "PlanExercise_planWorkoutId_order_idx" ON "PlanExercise"("planWorkoutId", "order");
