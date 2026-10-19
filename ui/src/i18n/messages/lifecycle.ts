import { createMessageCatalogs } from "everything-dev/ui/i18n";

export const lifecycleMessages = createMessageCatalogs(["en", "es", "fr", "zh"], {
  "lifecycle.approvals": ["approvals", "aprobaciones", "approbations", "批准"],
  "lifecycle.awaitingProposal": [
    "Awaiting votes · #{proposal}",
    "Esperando votos · #{proposal}",
    "En attente des votes · #{proposal}",
    "等待投票 · #{proposal}",
  ],
  "lifecycle.vote": ["Vote", "Votar", "Voter", "投票"],
  "lifecycle.you": ["You", "Tú", "Vous", "你"],
  "lifecycle.youLower": ["you", "tú", "vous", "你"],
  "poc.nearSignInFirst": [
    "Sign in with your NEAR wallet first",
    "Inicia sesión primero con tu billetera NEAR",
    "Connectez-vous d’abord avec votre portefeuille NEAR",
    "请先使用 NEAR 钱包登录",
  ],
});
