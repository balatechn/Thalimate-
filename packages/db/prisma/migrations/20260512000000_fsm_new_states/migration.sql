-- Add new conversation states for extended WhatsApp ordering flow

DO $$ BEGIN
    ALTER TYPE "ConversationState" ADD VALUE 'AWAITING_NAME';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "ConversationState" ADD VALUE 'AWAITING_ADDRESS_CHOICE';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "ConversationState" ADD VALUE 'AWAITING_NOTES';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
