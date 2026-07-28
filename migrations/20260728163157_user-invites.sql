-- Invitations: an admin invites an email with a preassigned role. The row is
-- both (a) the app's allow-list grant for that email and (b) the source of the
-- role the invitee gets on first sign-in (ensureProfile reads it). Managed only
-- through the admin client (server actions), never from the browser.

CREATE TABLE IF NOT EXISTS public.user_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text NOT NULL UNIQUE,          -- stored lowercased
  role_slug           text NOT NULL,
  invited_by          text NOT NULL,                 -- Clerk id of the inviter
  clerk_invitation_id text,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  accepted_at         timestamptz
);

ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;
