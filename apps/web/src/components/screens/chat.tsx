'use client';

// NNChat — the standalone /chat screen. The transcript + composer + stream
// driver + ThreadRail now live in the reusable `components/chat/chat-panel.tsx`
// (extracted for the NotebookLM M2 workspace, T4). This screen is a thin shell
// that renders ChatPanel in 'global' mode (rail + deck scope + research toggle +
// suggested pills + /research slash) — behavior-identical to the pre-extraction
// screen. The notebook workspace reuses the SAME ChatPanel in 'notebook' mode.

import { ChatPanel } from '@/components/chat/chat-panel';

export const NNChat = () => <ChatPanel mode="global" />;
