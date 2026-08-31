import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const TABLES = [
  "User","Session","TwoFactorRecoveryCode","PendingTwoFactorChallenge","PendingEmailChange",
  "PendingPhoneChange","LoginEvent","EmailVerificationToken","PasswordResetToken","Username",
  "Profile","Follow","Block","Notification","SocialLink","ExternalSocialAccount",
  "ExternalContentItem","ScheduledCrossPost","CrossPostTarget","Link","LinkClick","Post",
  "PostMedia","Poll","PollOption","PollVote","PostLike","Bookmark","Conversation",
  "ConversationParticipant","Message","MessageRequestState","Community","VoiceRoom",
  "VoiceRoomParticipant","CommunityMembershipEvent","CommunityChatMessage","CommunityTag",
  "CommunityPostFlair","CommunityMember","CommunityRule","WikiPage","WikiRevision","ModAction",
  "Business","BusinessLocation","ContactInfo","ContactMessage","Offering","OfferingPurchase",
  "BusinessMember","Review","ReviewResponse","Job","JobApplication","AvailabilityRule",
  "Appointment","BusinessDocument","CreatorPayoutAccount","PaymentTransaction",
  "PlatformSubscription","CustomDomain","Tip","MembershipTier","MembershipSubscription",
  "DigitalProduct","DigitalProductPurchase","Course","CourseModule","Lesson",
  "CourseAccessGrant","CourseProgress","Podcast","PodcastEpisode","PodcastFeedToken",
  "NewsletterSubscription","NewsletterIssue","AffiliateProgram","AffiliateLink",
  "AffiliateClick","AffiliateConversion","Livestream","LivestreamChatMessage","Project",
  "ProjectCollaborator","ProjectLike","ProjectComment","Skill","SkillEndorsement",
  "ProjectSkill","WorkExperience","Education","GitRepository","ResearchPaper","Certificate",
  "Award","Article","Hashtag","ArticleHashtag","Reaction","Comment","Book","PublishedFile",
  "PublishedFileDownload","Event","EventRSVP","TicketType","Ticket","MarketplaceListing",
  "MarketplacePurchase","InstalledApp","MarketplaceListingReview",
  "MarketplaceListingReviewResponse","DeveloperApp","OAuthScope","DeveloperAppScope",
  "OAuthAuthorizationCode","OAuthAuthorization","OAuthToken","WebhookSubscription",
  "WebhookDelivery","ApiUsageCounter","AIGeneration","ModerationFlag","FileAsset",
  "MediaAccessibilityMetadata","ContentTranslation","PlatformRole","TrustSafetyCase",
  "Report","Appeal","AccountRiskSignal","ContentRevision","ContentLicense",
  "DMCATakedownNotice","DMCACounterNotice","OwnershipTransfer","JurisdictionRule",
  "Organization","OrganizationMember","SSOConnection","SSOIdentity","OrganizationAuditLog",
  "DeviceToken","NotificationDeliveryPreference","IapPayoutBatch","JobAlert",
  "DigitalBusinessCard","ShortLink","ShortLinkClick","CalendarEntry","Form","FormResponse",
  "FundraisingCampaign","Donation","LearningPath","Quiz","QuizAttempt","Contact","Activity",
  "CoinTransfer","ReferralCode",
  // Coin ledger (addendum-coin-wallet-v2.md). Order doesn't matter — the
  // script runs with foreign_keys OFF — but LedgerHold → LedgerPosting →
  // LedgerTransaction reads naturally. LedgerAccount is handled separately
  // in main() so the migration-seeded system_* rows survive the wipe.
  "LedgerHold","LedgerPosting","LedgerTransaction",
];

// This wipes every table above unconditionally — no dry-run, no per-row
// confirmation. The only thing standing between "local dev.db" and
// "production Turso" is whatever DATABASE_URL happens to resolve to in the
// shell it's run from (e.g. a stray `vercel env pull` or a copy-pasted
// .env.production sourced by habit) — the same class of accident the
// removed cleanup-test-users endpoint and its CLEANUP_SECRET existed to
// guard against for the HTTP path. A remote libsql:// URL (Turso — what
// Preview/Production actually use, per src/lib/db.ts) requires an explicit
// opt-in; a local file: URL (the intended use of this script) does not.
function assertSafeToWipe(url: string): void {
  if (url.startsWith("file:")) return;
  if (process.env.CONFIRM_WIPE_REMOTE_DATABASE === url) return;
  throw new Error(
    `Refusing to wipe a non-local database (DATABASE_URL="${url}"). ` +
      `If this is genuinely intended (e.g. resetting a scratch/staging Turso branch, never production), ` +
      `re-run with CONFIRM_WIPE_REMOTE_DATABASE set to the exact same DATABASE_URL value as an explicit opt-in.`
  );
}

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  console.log(`About to wipe every user-data table at: ${url}`);
  assertSafeToWipe(url);

  const adapter = new PrismaLibSql({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  const prisma = new PrismaClient({ adapter });
  try {
    const before = await prisma.user.count();
    console.log(`Users before: ${before}`);

    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = OFF;`);
    for (const table of TABLES) {
      const n = await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
      if (n > 0) console.log(`  cleared ${table}: ${n} rows`);
    }

    // LedgerAccount: drop every per-user / per-business account but KEEP the
    // migration-seeded system_* rows (both owner columns NULL), then zero
    // every remaining cachedBalance so the next reconciliation run starts
    // from a clean, globally-balanced ledger rather than alarming on the
    // stale system_promo_issuance liability left by the wiped grants.
    const acc = await prisma.$executeRawUnsafe(
      `DELETE FROM "LedgerAccount" WHERE "ownerUserId" IS NOT NULL OR "ownerBusinessId" IS NOT NULL;`,
    );
    if (acc > 0) console.log(`  cleared LedgerAccount (owned): ${acc} rows`);
    await prisma.$executeRawUnsafe(`UPDATE "LedgerAccount" SET "cachedBalance" = 0;`);

    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = ON;`);

    const after = await prisma.user.count();
    console.log(`Users after: ${after}`);
  } catch (err) {
    console.error("FAILED:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
