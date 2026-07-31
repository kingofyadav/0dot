-- AlterTable
ALTER TABLE "VoiceRoomParticipant" ADD COLUMN "requestedToSpeakAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VoiceRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "startsAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentSpeakerId" TEXT,
    "currentSpeakerSince" DATETIME,
    CONSTRAINT "VoiceRoom_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceRoom_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceRoom_currentSpeakerId_fkey" FOREIGN KEY ("currentSpeakerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VoiceRoom" ("communityId", "createdAt", "createdBy", "endedAt", "id", "startsAt", "status", "title") SELECT "communityId", "createdAt", "createdBy", "endedAt", "id", "startsAt", "status", "title" FROM "VoiceRoom";
DROP TABLE "VoiceRoom";
ALTER TABLE "new_VoiceRoom" RENAME TO "VoiceRoom";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
