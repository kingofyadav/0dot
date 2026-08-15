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
  "MediaAccessibilityMetadata","ContentTranslation","TrustSafetyStaffRole","TrustSafetyCase",
  "Report","Appeal","AccountRiskSignal","ContentRevision","ContentLicense",
  "DMCATakedownNotice","DMCACounterNotice","OwnershipTransfer","JurisdictionRule",
  "Organization","OrganizationMember","SSOConnection","SSOIdentity","OrganizationAuditLog",
  "DeviceToken","NotificationDeliveryPreference","IapPayoutBatch","JobAlert",
  "DigitalBusinessCard","ShortLink","ShortLinkClick","CalendarEntry","Form","FormResponse",
  "FundraisingCampaign","Donation","LearningPath","Quiz","QuizAttempt","Contact","Activity",
  "CoinTopUpRequest","CoinTransfer","CoinPayoutRequest",
];

async function main() {
  const adapter = new PrismaLibSql({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
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
