import "@orpc/openapi/extensions/route";
import type { GenerateIntentRequest, SubmitIntentRequest } from "@near-intents-agent-api/contracts/api";
import { z } from "zod";
export declare const contract: {
    ping: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        message: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        message: z.ZodString;
        timestamp: z.ZodString;
    }, z.core.$strip>, object>;
    dbHealth: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        ok: z.ZodBoolean;
        agentCount: z.ZodNumber;
    }, z.core.$strip>, object>;
    generateIntent: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"agent_create">;
        name: z.ZodString;
        externalUserId: z.ZodOptional<z.ZodString>;
        owner: z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"near">;
            accountId: z.ZodString;
            publicKey: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"evm">;
            address: z.ZodString;
            chainId: z.ZodNumber;
            publicKey: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"passkey">;
            credentialId: z.ZodString;
            publicKey: z.ZodString;
            rpId: z.ZodString;
            origin: z.ZodString;
        }, z.core.$strict>], "type">;
        policy: z.ZodObject<{
            version: z.ZodLiteral<1>;
            capabilities: z.ZodObject<{
                confidential: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    requires_approval: z.ZodBoolean;
                }, z.core.$strict>;
                cross_chain_withdraw: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    requires_approval: z.ZodBoolean;
                }, z.core.$strict>;
                evm_sign: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    raw_tx: z.ZodBoolean;
                }, z.core.$strict>;
                raw_sign: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    chains: z.ZodArray<z.ZodString>;
                    requires_approval: z.ZodBoolean;
                }, z.core.$strict>;
                sign_message: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    requires_approval: z.ZodBoolean;
                    allowed_recipients: z.ZodArray<z.ZodString>;
                }, z.core.$strict>;
                swap: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    requires_approval: z.ZodBoolean;
                }, z.core.$strict>;
            }, z.core.$strict>;
            frozen: z.ZodBoolean;
            rules: z.ZodObject<{
                allowed_tokens: z.ZodArray<z.ZodString>;
                transaction_types: z.ZodArray<z.ZodEnum<{
                    call: "call";
                    confidential: "confidential";
                    cross_chain_withdraw: "cross_chain_withdraw";
                    delete: "delete";
                    intents_transfer: "intents_transfer";
                    nft_transfer: "nft_transfer";
                    swap: "swap";
                    transfer: "transfer";
                    withdraw: "withdraw";
                }>>;
                limits: z.ZodOptional<z.ZodObject<{
                    per_transaction: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    hourly: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    daily: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    monthly: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                }, z.core.$strict>>;
                rate_limit: z.ZodOptional<z.ZodObject<{
                    max_per_hour: z.ZodNumber;
                }, z.core.$strict>>;
                addresses: z.ZodOptional<z.ZodObject<{
                    mode: z.ZodEnum<{
                        blacklist: "blacklist";
                        whitelist: "whitelist";
                    }>;
                    list: z.ZodArray<z.ZodString>;
                }, z.core.$strict>>;
                items: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
            }, z.core.$strict>;
            approval: z.ZodOptional<z.ZodObject<{
                approvers: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    pubkey: z.ZodString;
                    role: z.ZodEnum<{
                        admin: "admin";
                        signer: "signer";
                    }>;
                }, z.core.$strict>>;
                excluded_types: z.ZodArray<z.ZodEnum<{
                    call: "call";
                    confidential: "confidential";
                    cross_chain_withdraw: "cross_chain_withdraw";
                    delete: "delete";
                    intents_transfer: "intents_transfer";
                    nft_transfer: "nft_transfer";
                    swap: "swap";
                    transfer: "transfer";
                    withdraw: "withdraw";
                }>>;
                threshold: z.ZodObject<{
                    required: z.ZodNumber;
                }, z.core.$strict>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"policy_update">;
        policy: z.ZodObject<{
            version: z.ZodLiteral<1>;
            capabilities: z.ZodObject<{
                confidential: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    requires_approval: z.ZodBoolean;
                }, z.core.$strict>;
                cross_chain_withdraw: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    requires_approval: z.ZodBoolean;
                }, z.core.$strict>;
                evm_sign: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    raw_tx: z.ZodBoolean;
                }, z.core.$strict>;
                raw_sign: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    chains: z.ZodArray<z.ZodString>;
                    requires_approval: z.ZodBoolean;
                }, z.core.$strict>;
                sign_message: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    requires_approval: z.ZodBoolean;
                    allowed_recipients: z.ZodArray<z.ZodString>;
                }, z.core.$strict>;
                swap: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    requires_approval: z.ZodBoolean;
                }, z.core.$strict>;
            }, z.core.$strict>;
            frozen: z.ZodBoolean;
            rules: z.ZodObject<{
                allowed_tokens: z.ZodArray<z.ZodString>;
                transaction_types: z.ZodArray<z.ZodEnum<{
                    call: "call";
                    confidential: "confidential";
                    cross_chain_withdraw: "cross_chain_withdraw";
                    delete: "delete";
                    intents_transfer: "intents_transfer";
                    nft_transfer: "nft_transfer";
                    swap: "swap";
                    transfer: "transfer";
                    withdraw: "withdraw";
                }>>;
                limits: z.ZodOptional<z.ZodObject<{
                    per_transaction: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    hourly: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    daily: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    monthly: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                }, z.core.$strict>>;
                rate_limit: z.ZodOptional<z.ZodObject<{
                    max_per_hour: z.ZodNumber;
                }, z.core.$strict>>;
                addresses: z.ZodOptional<z.ZodObject<{
                    mode: z.ZodEnum<{
                        blacklist: "blacklist";
                        whitelist: "whitelist";
                    }>;
                    list: z.ZodArray<z.ZodString>;
                }, z.core.$strict>>;
                items: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
            }, z.core.$strict>;
            approval: z.ZodOptional<z.ZodObject<{
                approvers: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    pubkey: z.ZodString;
                    role: z.ZodEnum<{
                        admin: "admin";
                        signer: "signer";
                    }>;
                }, z.core.$strict>>;
                excluded_types: z.ZodArray<z.ZodEnum<{
                    call: "call";
                    confidential: "confidential";
                    cross_chain_withdraw: "cross_chain_withdraw";
                    delete: "delete";
                    intents_transfer: "intents_transfer";
                    nft_transfer: "nft_transfer";
                    swap: "swap";
                    transfer: "transfer";
                    withdraw: "withdraw";
                }>>;
                threshold: z.ZodObject<{
                    required: z.ZodNumber;
                }, z.core.$strict>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        expectedRevision: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"agent_freeze">;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"agent_unfreeze">;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"grant_issue">;
        label: z.ZodString;
        credential: z.ZodString;
        actions: z.ZodArray<z.ZodString>;
        recipients: z.ZodDefault<z.ZodArray<z.ZodObject<{
            action: z.ZodEnum<{
                confidential_transfer: "confidential_transfer";
                cross_chain_deposit: "cross_chain_deposit";
                intents_transfer: "intents_transfer";
                withdraw: "withdraw";
            }>;
            kind: z.ZodEnum<{
                "chain-address": "chain-address";
                "confidential-account": "confidential-account";
                "intents-account": "intents-account";
            }>;
            chain: z.ZodString;
            network: z.ZodLiteral<"mainnet">;
            address: z.ZodString;
            memo: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"none">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"exact">;
                value: z.ZodString;
            }, z.core.$strict>]>;
            purpose: z.ZodEnum<{
                payout: "payout";
                refund: "refund";
            }>;
        }, z.core.$strict>>>;
        signingAudiences: z.ZodDefault<z.ZodArray<z.ZodString>>;
        expiresAt: z.ZodISODateTime;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"grant_revoke">;
        grantId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"timelock_set">;
        delaySeconds: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"budget_set">;
        dailyUsd: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        weeklyUsd: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        monthlyUsd: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"execution_cancel">;
        correlationId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"agent_archive">;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"agent_restore">;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"agent_delete">;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"approval_vote">;
        approvalId: z.ZodUUID;
        verdict: z.ZodEnum<{
            approve: "approve";
            reject: "reject";
        }>;
        signer: z.ZodOptional<z.ZodObject<{
            accountId: z.ZodString;
            publicKey: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"signing_artifact_read">;
        correlationId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
        type: z.ZodLiteral<"signing_artifact_ack">;
        correlationId: z.ZodString;
    }, z.core.$strict>], "type">, z.ZodObject<{
        correlationId: z.ZodString;
        type: z.ZodEnum<{
            agent_archive: "agent_archive";
            agent_create: "agent_create";
            agent_delete: "agent_delete";
            agent_freeze: "agent_freeze";
            agent_restore: "agent_restore";
            agent_unfreeze: "agent_unfreeze";
            approval_vote: "approval_vote";
            budget_set: "budget_set";
            execution_cancel: "execution_cancel";
            grant_issue: "grant_issue";
            grant_revoke: "grant_revoke";
            policy_update: "policy_update";
            signing_artifact_ack: "signing_artifact_ack";
            signing_artifact_read: "signing_artifact_read";
            timelock_set: "timelock_set";
        }>;
        agentId: z.ZodString;
        status: z.ZodLiteral<"PENDING_SIGNATURE">;
        expiresAt: z.ZodISODateTime;
        signer: z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"near">;
            accountId: z.ZodString;
            publicKey: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"evm">;
            address: z.ZodString;
            chainId: z.ZodNumber;
            publicKey: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"passkey">;
            credentialId: z.ZodString;
            publicKey: z.ZodString;
            rpId: z.ZodString;
            origin: z.ZodString;
        }, z.core.$strict>], "type">;
        intent: z.ZodDiscriminatedUnion<[z.ZodObject<{
            standard: z.ZodLiteral<"nep413">;
            payload: z.ZodObject<{
                message: z.ZodString;
                recipient: z.ZodString;
                nonce: z.ZodString;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            standard: z.ZodLiteral<"nep366">;
            payload: z.ZodObject<{
                receiverId: z.ZodString;
                actions: z.ZodArray<z.ZodObject<{
                    type: z.ZodLiteral<"FunctionCall">;
                    params: z.ZodObject<{
                        methodName: z.ZodString;
                        args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                        gas: z.ZodString;
                        deposit: z.ZodString;
                    }, z.core.$strict>;
                }, z.core.$strict>>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            standard: z.ZodLiteral<"eip712">;
            payload: z.ZodObject<{
                domain: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                types: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodObject<{
                    name: z.ZodString;
                    type: z.ZodString;
                }, z.core.$strict>>>;
                primaryType: z.ZodString;
                message: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            standard: z.ZodLiteral<"webauthn">;
            payload: z.ZodObject<{
                challenge: z.ZodString;
                rpId: z.ZodString;
                allowCredentials: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    type: z.ZodLiteral<"public-key">;
                }, z.core.$strict>>;
                userVerification: z.ZodLiteral<"required">;
                timeout: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>], "standard">;
        preview: z.ZodObject<{
            summary: z.ZodString;
            revision: z.ZodOptional<z.ZodNumber>;
            previousRevision: z.ZodOptional<z.ZodNumber>;
            policyHash: z.ZodOptional<z.ZodString>;
            deletion: z.ZodOptional<z.ZodObject<{
                nearAccountId: z.ZodString;
                beneficiary: z.ZodString;
                nativeBalance: z.ZodString;
                public: z.ZodArray<z.ZodObject<{
                    assetId: z.ZodString;
                    price: z.ZodNullable<z.ZodNumber>;
                    priceUpdatedAt: z.ZodNullable<z.ZodString>;
                    priceExpiresAt: z.ZodNullable<z.ZodString>;
                    symbol: z.ZodNullable<z.ZodString>;
                    decimals: z.ZodNullable<z.ZodNumber>;
                    blockchain: z.ZodNullable<z.ZodString>;
                    balanceRaw: z.ZodString;
                    balance: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>>;
                confidential: z.ZodArray<z.ZodObject<{
                    assetId: z.ZodString;
                    price: z.ZodNullable<z.ZodNumber>;
                    priceUpdatedAt: z.ZodNullable<z.ZodString>;
                    priceExpiresAt: z.ZodNullable<z.ZodString>;
                    symbol: z.ZodNullable<z.ZodString>;
                    decimals: z.ZodNullable<z.ZodNumber>;
                    blockchain: z.ZodNullable<z.ZodString>;
                    balanceRaw: z.ZodString;
                    balance: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>>;
                assetsLost: z.ZodBoolean;
                retirement: z.ZodEnum<{
                    credential_erase: "credential_erase";
                    provider_delete: "provider_delete";
                }>;
                policyAllowsDelete: z.ZodBoolean;
            }, z.core.$strict>>;
            approval: z.ZodOptional<z.ZodObject<{
                approvalId: z.ZodUUID;
                requestType: z.ZodString;
                requestHash: z.ZodString;
                verdict: z.ZodEnum<{
                    approve: "approve";
                    reject: "reject";
                }>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        replayed: z.ZodBoolean;
    }, z.core.$strict>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    submitIntent: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        type: z.ZodEnum<{
            agent_archive: "agent_archive";
            agent_create: "agent_create";
            agent_delete: "agent_delete";
            agent_freeze: "agent_freeze";
            agent_restore: "agent_restore";
            agent_unfreeze: "agent_unfreeze";
            approval_vote: "approval_vote";
            budget_set: "budget_set";
            execution_cancel: "execution_cancel";
            grant_issue: "grant_issue";
            grant_revoke: "grant_revoke";
            policy_update: "policy_update";
            signing_artifact_ack: "signing_artifact_ack";
            signing_artifact_read: "signing_artifact_read";
            timelock_set: "timelock_set";
        }>;
        correlationId: z.ZodString;
        signedData: z.ZodDiscriminatedUnion<[z.ZodObject<{
            standard: z.ZodLiteral<"nep413">;
            payload: z.ZodObject<{
                message: z.ZodString;
                recipient: z.ZodString;
                nonce: z.ZodString;
            }, z.core.$strict>;
            public_key: z.ZodString;
            signature: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            standard: z.ZodLiteral<"nep366">;
            payload: z.ZodObject<{
                receiverId: z.ZodString;
                actions: z.ZodArray<z.ZodObject<{
                    type: z.ZodLiteral<"FunctionCall">;
                    params: z.ZodObject<{
                        methodName: z.ZodString;
                        args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                        gas: z.ZodString;
                        deposit: z.ZodString;
                    }, z.core.$strict>;
                }, z.core.$strict>>;
            }, z.core.$strict>;
            signedDelegate: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            standard: z.ZodLiteral<"eip712">;
            payload: z.ZodObject<{
                domain: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                types: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodObject<{
                    name: z.ZodString;
                    type: z.ZodString;
                }, z.core.$strict>>>;
                primaryType: z.ZodString;
                message: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            }, z.core.$strict>;
            signature: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            standard: z.ZodLiteral<"webauthn">;
            payload: z.ZodObject<{
                challenge: z.ZodString;
                rpId: z.ZodString;
                allowCredentials: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    type: z.ZodLiteral<"public-key">;
                }, z.core.$strict>>;
                userVerification: z.ZodLiteral<"required">;
                timeout: z.ZodNumber;
            }, z.core.$strict>;
            credential: z.ZodObject<{
                id: z.ZodString;
                rawId: z.ZodString;
                type: z.ZodLiteral<"public-key">;
                response: z.ZodObject<{
                    clientDataJSON: z.ZodString;
                    authenticatorData: z.ZodString;
                    signature: z.ZodString;
                    userHandle: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
                clientExtensionResults: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                authenticatorAttachment: z.ZodOptional<z.ZodEnum<{
                    "cross-platform": "cross-platform";
                    platform: "platform";
                }>>;
            }, z.core.$strip>;
        }, z.core.$strict>], "standard">;
    }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>, ...z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>[]], "type">, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    intentStatus: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        correlationId: z.ZodString;
        waitMs: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>, ...z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>[]], "type">, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    listAgents: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        externalUserId: z.ZodOptional<z.ZodString>;
        cursor: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>, z.ZodObject<{
        data: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            externalUserId: z.ZodNullable<z.ZodString>;
            status: z.ZodEnum<{
                ABANDONED: "ABANDONED";
                ACTIVE: "ACTIVE";
                ARCHIVED: "ARCHIVED";
                DELETED: "DELETED";
                PENDING: "PENDING";
            }>;
            archived: z.ZodBoolean;
            deleted: z.ZodBoolean;
            owner: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                type: z.ZodLiteral<"near">;
                accountId: z.ZodString;
                publicKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"evm">;
                address: z.ZodString;
                chainId: z.ZodNumber;
                publicKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"passkey">;
                credentialId: z.ZodString;
                publicKey: z.ZodString;
                rpId: z.ZodString;
                origin: z.ZodString;
            }, z.core.$strict>], "type">>;
            ownerAccount: z.ZodNullable<z.ZodObject<{
                accountId: z.ZodString;
                publicKey: z.ZodString;
                authority: z.ZodLiteral<"wallet">;
            }, z.core.$strict>>;
            wallet: z.ZodNullable<z.ZodObject<{
                walletId: z.ZodString;
                nearAccountId: z.ZodString;
                evmAddress: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>;
            createdAt: z.ZodString;
        }, z.core.$strict>>;
        nextCursor: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    getAgent: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        externalUserId: z.ZodNullable<z.ZodString>;
        status: z.ZodEnum<{
            ABANDONED: "ABANDONED";
            ACTIVE: "ACTIVE";
            ARCHIVED: "ARCHIVED";
            DELETED: "DELETED";
            PENDING: "PENDING";
        }>;
        archived: z.ZodBoolean;
        deleted: z.ZodBoolean;
        owner: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"near">;
            accountId: z.ZodString;
            publicKey: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"evm">;
            address: z.ZodString;
            chainId: z.ZodNumber;
            publicKey: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"passkey">;
            credentialId: z.ZodString;
            publicKey: z.ZodString;
            rpId: z.ZodString;
            origin: z.ZodString;
        }, z.core.$strict>], "type">>;
        ownerAccount: z.ZodNullable<z.ZodObject<{
            accountId: z.ZodString;
            publicKey: z.ZodString;
            authority: z.ZodLiteral<"wallet">;
        }, z.core.$strict>>;
        wallet: z.ZodNullable<z.ZodObject<{
            walletId: z.ZodString;
            nearAccountId: z.ZodString;
            evmAddress: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>;
        createdAt: z.ZodString;
    }, z.core.$strict>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    getWallet: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        walletId: z.ZodString;
        nearAccountId: z.ZodString;
        evmAddress: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    getBalances: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodIntersection<z.ZodObject<{
        source: z.ZodDefault<z.ZodEnum<{
            confidential: "confidential";
            public: "public";
        }>>;
        asset: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>>, z.ZodObject<{
        nearAccountId: z.ZodString;
        source: z.ZodEnum<{
            confidential: "confidential";
            public: "public";
        }>;
        balances: z.ZodArray<z.ZodObject<{
            assetId: z.ZodString;
            price: z.ZodNullable<z.ZodNumber>;
            priceUpdatedAt: z.ZodNullable<z.ZodString>;
            priceExpiresAt: z.ZodNullable<z.ZodString>;
            symbol: z.ZodNullable<z.ZodString>;
            decimals: z.ZodNullable<z.ZodNumber>;
            blockchain: z.ZodNullable<z.ZodString>;
            balanceRaw: z.ZodString;
            balance: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    getPolicy: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        walletId: z.ZodString;
        revision: z.ZodNullable<z.ZodNumber>;
        policyHash: z.ZodNullable<z.ZodString>;
        status: z.ZodEnum<{
            APPLIED: "APPLIED";
            FAILED: "FAILED";
            NONE: "NONE";
            SIGNED: "SIGNED";
        }>;
        appliedAt: z.ZodNullable<z.ZodString>;
        transactionHash: z.ZodNullable<z.ZodString>;
        providerPolicySynced: z.ZodBoolean;
        policy: z.ZodNullable<z.ZodObject<{
            version: z.ZodLiteral<1>;
            capabilities: z.ZodObject<{
                confidential: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    requires_approval: z.ZodBoolean;
                }, z.core.$strict>;
                cross_chain_withdraw: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    requires_approval: z.ZodBoolean;
                }, z.core.$strict>;
                evm_sign: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    raw_tx: z.ZodBoolean;
                }, z.core.$strict>;
                raw_sign: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    chains: z.ZodArray<z.ZodString>;
                    requires_approval: z.ZodBoolean;
                }, z.core.$strict>;
                sign_message: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    requires_approval: z.ZodBoolean;
                    allowed_recipients: z.ZodArray<z.ZodString>;
                }, z.core.$strict>;
                swap: z.ZodObject<{
                    allowed: z.ZodBoolean;
                    requires_approval: z.ZodBoolean;
                }, z.core.$strict>;
            }, z.core.$strict>;
            frozen: z.ZodBoolean;
            rules: z.ZodObject<{
                allowed_tokens: z.ZodArray<z.ZodString>;
                transaction_types: z.ZodArray<z.ZodEnum<{
                    call: "call";
                    confidential: "confidential";
                    cross_chain_withdraw: "cross_chain_withdraw";
                    delete: "delete";
                    intents_transfer: "intents_transfer";
                    nft_transfer: "nft_transfer";
                    swap: "swap";
                    transfer: "transfer";
                    withdraw: "withdraw";
                }>>;
                limits: z.ZodOptional<z.ZodObject<{
                    per_transaction: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    hourly: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    daily: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    monthly: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                }, z.core.$strict>>;
                rate_limit: z.ZodOptional<z.ZodObject<{
                    max_per_hour: z.ZodNumber;
                }, z.core.$strict>>;
                addresses: z.ZodOptional<z.ZodObject<{
                    mode: z.ZodEnum<{
                        blacklist: "blacklist";
                        whitelist: "whitelist";
                    }>;
                    list: z.ZodArray<z.ZodString>;
                }, z.core.$strict>>;
                items: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
            }, z.core.$strict>;
            approval: z.ZodOptional<z.ZodObject<{
                approvers: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    pubkey: z.ZodString;
                    role: z.ZodEnum<{
                        admin: "admin";
                        signer: "signer";
                    }>;
                }, z.core.$strict>>;
                excluded_types: z.ZodArray<z.ZodEnum<{
                    call: "call";
                    confidential: "confidential";
                    cross_chain_withdraw: "cross_chain_withdraw";
                    delete: "delete";
                    intents_transfer: "intents_transfer";
                    nft_transfer: "nft_transfer";
                    swap: "swap";
                    transfer: "transfer";
                    withdraw: "withdraw";
                }>>;
                threshold: z.ZodObject<{
                    required: z.ZodNumber;
                }, z.core.$strict>;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
    }, z.core.$strict>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    getPolicyHistory: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodIntersection<z.ZodObject<{
        cursor: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
        limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>>, z.ZodObject<{
        data: z.ZodArray<z.ZodObject<{
            walletId: z.ZodString;
            revision: z.ZodNullable<z.ZodNumber>;
            policyHash: z.ZodNullable<z.ZodString>;
            status: z.ZodEnum<{
                APPLIED: "APPLIED";
                FAILED: "FAILED";
                NONE: "NONE";
                SIGNED: "SIGNED";
            }>;
            appliedAt: z.ZodNullable<z.ZodString>;
            transactionHash: z.ZodNullable<z.ZodString>;
            policy: z.ZodNullable<z.ZodObject<{
                version: z.ZodLiteral<1>;
                capabilities: z.ZodObject<{
                    confidential: z.ZodObject<{
                        allowed: z.ZodBoolean;
                        requires_approval: z.ZodBoolean;
                    }, z.core.$strict>;
                    cross_chain_withdraw: z.ZodObject<{
                        allowed: z.ZodBoolean;
                        requires_approval: z.ZodBoolean;
                    }, z.core.$strict>;
                    evm_sign: z.ZodObject<{
                        allowed: z.ZodBoolean;
                        raw_tx: z.ZodBoolean;
                    }, z.core.$strict>;
                    raw_sign: z.ZodObject<{
                        allowed: z.ZodBoolean;
                        chains: z.ZodArray<z.ZodString>;
                        requires_approval: z.ZodBoolean;
                    }, z.core.$strict>;
                    sign_message: z.ZodObject<{
                        allowed: z.ZodBoolean;
                        requires_approval: z.ZodBoolean;
                        allowed_recipients: z.ZodArray<z.ZodString>;
                    }, z.core.$strict>;
                    swap: z.ZodObject<{
                        allowed: z.ZodBoolean;
                        requires_approval: z.ZodBoolean;
                    }, z.core.$strict>;
                }, z.core.$strict>;
                frozen: z.ZodBoolean;
                rules: z.ZodObject<{
                    allowed_tokens: z.ZodArray<z.ZodString>;
                    transaction_types: z.ZodArray<z.ZodEnum<{
                        call: "call";
                        confidential: "confidential";
                        cross_chain_withdraw: "cross_chain_withdraw";
                        delete: "delete";
                        intents_transfer: "intents_transfer";
                        nft_transfer: "nft_transfer";
                        swap: "swap";
                        transfer: "transfer";
                        withdraw: "withdraw";
                    }>>;
                    limits: z.ZodOptional<z.ZodObject<{
                        per_transaction: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                        hourly: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                        daily: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                        monthly: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    }, z.core.$strict>>;
                    rate_limit: z.ZodOptional<z.ZodObject<{
                        max_per_hour: z.ZodNumber;
                    }, z.core.$strict>>;
                    addresses: z.ZodOptional<z.ZodObject<{
                        mode: z.ZodEnum<{
                            blacklist: "blacklist";
                            whitelist: "whitelist";
                        }>;
                        list: z.ZodArray<z.ZodString>;
                    }, z.core.$strict>>;
                    items: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
                }, z.core.$strict>;
                approval: z.ZodOptional<z.ZodObject<{
                    approvers: z.ZodArray<z.ZodObject<{
                        id: z.ZodString;
                        pubkey: z.ZodString;
                        role: z.ZodEnum<{
                            admin: "admin";
                            signer: "signer";
                        }>;
                    }, z.core.$strict>>;
                    excluded_types: z.ZodArray<z.ZodEnum<{
                        call: "call";
                        confidential: "confidential";
                        cross_chain_withdraw: "cross_chain_withdraw";
                        delete: "delete";
                        intents_transfer: "intents_transfer";
                        nft_transfer: "nft_transfer";
                        swap: "swap";
                        transfer: "transfer";
                        withdraw: "withdraw";
                    }>>;
                    threshold: z.ZodObject<{
                        required: z.ZodNumber;
                    }, z.core.$strict>;
                }, z.core.$strict>>;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
        nextCursor: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    getLimits: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        walletId: z.ZodString;
        frozen: z.ZodNullable<z.ZodBoolean>;
        capabilities: z.ZodNullable<z.ZodObject<{
            confidential: z.ZodObject<{
                allowed: z.ZodBoolean;
                requires_approval: z.ZodBoolean;
            }, z.core.$strict>;
            cross_chain_withdraw: z.ZodObject<{
                allowed: z.ZodBoolean;
                requires_approval: z.ZodBoolean;
            }, z.core.$strict>;
            evm_sign: z.ZodObject<{
                allowed: z.ZodBoolean;
                raw_tx: z.ZodBoolean;
            }, z.core.$strict>;
            raw_sign: z.ZodObject<{
                allowed: z.ZodBoolean;
                chains: z.ZodArray<z.ZodString>;
                requires_approval: z.ZodBoolean;
            }, z.core.$strict>;
            sign_message: z.ZodObject<{
                allowed: z.ZodBoolean;
                requires_approval: z.ZodBoolean;
                allowed_recipients: z.ZodArray<z.ZodString>;
            }, z.core.$strict>;
            swap: z.ZodObject<{
                allowed: z.ZodBoolean;
                requires_approval: z.ZodBoolean;
            }, z.core.$strict>;
        }, z.core.$strict>>;
        limits: z.ZodNullable<z.ZodObject<{
            per_transaction: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            hourly: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            daily: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            monthly: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, z.core.$strict>>;
        rateLimit: z.ZodNullable<z.ZodObject<{
            max_per_hour: z.ZodNumber;
        }, z.core.$strict>>;
        addresses: z.ZodNullable<z.ZodObject<{
            mode: z.ZodEnum<{
                blacklist: "blacklist";
                whitelist: "whitelist";
            }>;
            list: z.ZodArray<z.ZodString>;
        }, z.core.$strict>>;
        allowedTokens: z.ZodNullable<z.ZodArray<z.ZodString>>;
        transactionTypes: z.ZodNullable<z.ZodArray<z.ZodEnum<{
            call: "call";
            confidential: "confidential";
            cross_chain_withdraw: "cross_chain_withdraw";
            delete: "delete";
            intents_transfer: "intents_transfer";
            nft_transfer: "nft_transfer";
            swap: "swap";
            transfer: "transfer";
            withdraw: "withdraw";
        }>>>;
        approval: z.ZodNullable<z.ZodObject<{
            approvers: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                pubkey: z.ZodString;
                role: z.ZodEnum<{
                    admin: "admin";
                    signer: "signer";
                }>;
            }, z.core.$strict>>;
            excluded_types: z.ZodArray<z.ZodEnum<{
                call: "call";
                confidential: "confidential";
                cross_chain_withdraw: "cross_chain_withdraw";
                delete: "delete";
                intents_transfer: "intents_transfer";
                nft_transfer: "nft_transfer";
                swap: "swap";
                transfer: "transfer";
                withdraw: "withdraw";
            }>>;
            threshold: z.ZodObject<{
                required: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>>;
        policySynced: z.ZodBoolean;
    }, z.core.$strict>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    getBudget: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        daily: z.ZodObject<{
            limitUsd: z.ZodNullable<z.ZodString>;
            spentUsd: z.ZodString;
            remainingUsd: z.ZodNullable<z.ZodString>;
            resetsAt: z.ZodNullable<z.ZodISODateTime>;
        }, z.core.$strict>;
        weekly: z.ZodObject<{
            limitUsd: z.ZodNullable<z.ZodString>;
            spentUsd: z.ZodString;
            remainingUsd: z.ZodNullable<z.ZodString>;
            resetsAt: z.ZodNullable<z.ZodISODateTime>;
        }, z.core.$strict>;
        monthly: z.ZodObject<{
            limitUsd: z.ZodNullable<z.ZodString>;
            spentUsd: z.ZodString;
            remainingUsd: z.ZodNullable<z.ZodString>;
            resetsAt: z.ZodNullable<z.ZodISODateTime>;
        }, z.core.$strict>;
        revision: z.ZodNumber;
        enforcedBy: z.ZodLiteral<"agent_api">;
    }, z.core.$strict>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    getTimelock: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        delaySeconds: z.ZodNumber;
        revision: z.ZodNumber;
        scheduledCount: z.ZodNumber;
        enforcedBy: z.ZodLiteral<"agent_api">;
    }, z.core.$strict>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    listScheduledExecutions: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodIntersection<z.ZodObject<{
        cursor: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>>, z.ZodObject<{
        data: z.ZodArray<z.ZodObject<{
            correlationId: z.ZodString;
            executeAfter: z.ZodISODateTime;
            state: z.ZodEnum<{
                dispatching: "dispatching";
                waiting: "waiting";
            }>;
            action: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>;
        nextCursor: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    getTokenCatalog: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        data: z.ZodArray<z.ZodObject<{
            assetId: z.ZodString;
            symbol: z.ZodString;
            decimals: z.ZodNumber;
            blockchain: z.ZodString;
            price: z.ZodNullable<z.ZodNumber>;
            priceUpdatedAt: z.ZodNullable<z.ZodString>;
            priceExpiresAt: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>, object>;
    getHistory: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodIntersection<z.ZodObject<{
        cursor: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>>, z.ZodObject<{
        data: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<string>;
        }, z.core.$strip>, ...z.ZodObject<{
            type: z.ZodLiteral<string>;
        }, z.core.$strip>[]], "type">>;
        nextCursor: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    listGrants: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        data: z.ZodArray<z.ZodObject<{
            grantId: z.ZodString;
            agentId: z.ZodString;
            walletId: z.ZodString;
            label: z.ZodString;
            actions: z.ZodArray<z.ZodString>;
            recipients: z.ZodArray<z.ZodObject<{
                action: z.ZodEnum<{
                    confidential_transfer: "confidential_transfer";
                    cross_chain_deposit: "cross_chain_deposit";
                    intents_transfer: "intents_transfer";
                    withdraw: "withdraw";
                }>;
                kind: z.ZodEnum<{
                    "chain-address": "chain-address";
                    "confidential-account": "confidential-account";
                    "intents-account": "intents-account";
                }>;
                chain: z.ZodString;
                network: z.ZodLiteral<"mainnet">;
                address: z.ZodString;
                memo: z.ZodUnion<readonly [z.ZodObject<{
                    kind: z.ZodLiteral<"none">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"exact">;
                    value: z.ZodString;
                }, z.core.$strict>]>;
                purpose: z.ZodEnum<{
                    payout: "payout";
                    refund: "refund";
                }>;
            }, z.core.$strict>>;
            signingAudiences: z.ZodArray<z.ZodString>;
            issuedAt: z.ZodString;
            expiresAt: z.ZodString;
            revokedAt: z.ZodNullable<z.ZodString>;
            revokedReason: z.ZodNullable<z.ZodString>;
            ownerEpoch: z.ZodNumber;
            ownerMessage: z.ZodUnion<readonly [z.ZodObject<{
                domain: z.ZodLiteral<"near-intents-agent-api.agent-grant.v4">;
                owner: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    type: z.ZodLiteral<"near">;
                    accountId: z.ZodString;
                    publicKey: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    type: z.ZodLiteral<"evm">;
                    address: z.ZodString;
                    chainId: z.ZodNumber;
                    publicKey: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    type: z.ZodLiteral<"passkey">;
                    credentialId: z.ZodString;
                    publicKey: z.ZodString;
                    rpId: z.ZodString;
                    origin: z.ZodString;
                }, z.core.$strict>], "type">;
                tenant_id: z.ZodString;
                agent_id: z.ZodString;
                wallet_id: z.ZodString;
                label: z.ZodString;
                credential: z.ZodString;
                actions: z.ZodArray<z.ZodString>;
                recipients: z.ZodArray<z.ZodObject<{
                    action: z.ZodEnum<{
                        confidential_transfer: "confidential_transfer";
                        cross_chain_deposit: "cross_chain_deposit";
                        intents_transfer: "intents_transfer";
                        withdraw: "withdraw";
                    }>;
                    kind: z.ZodEnum<{
                        "chain-address": "chain-address";
                        "confidential-account": "confidential-account";
                        "intents-account": "intents-account";
                    }>;
                    chain: z.ZodString;
                    network: z.ZodLiteral<"mainnet">;
                    address: z.ZodString;
                    memo: z.ZodUnion<readonly [z.ZodObject<{
                        kind: z.ZodLiteral<"none">;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"exact">;
                        value: z.ZodString;
                    }, z.core.$strict>]>;
                    purpose: z.ZodEnum<{
                        payout: "payout";
                        refund: "refund";
                    }>;
                }, z.core.$strict>>;
                signing_audiences: z.ZodArray<z.ZodString>;
                network: z.ZodLiteral<"mainnet">;
                issued_at_ms: z.ZodNumber;
                expires_at_ms: z.ZodNumber;
                owner_epoch: z.ZodNumber;
                nonce: z.ZodString;
                recipient: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                owner: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    type: z.ZodLiteral<"near">;
                    accountId: z.ZodString;
                    publicKey: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    type: z.ZodLiteral<"evm">;
                    address: z.ZodString;
                    chainId: z.ZodNumber;
                    publicKey: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    type: z.ZodLiteral<"passkey">;
                    credentialId: z.ZodString;
                    publicKey: z.ZodString;
                    rpId: z.ZodString;
                    origin: z.ZodString;
                }, z.core.$strict>], "type">;
                tenant_id: z.ZodString;
                agent_id: z.ZodString;
                wallet_id: z.ZodString;
                label: z.ZodString;
                credential: z.ZodString;
                actions: z.ZodArray<z.ZodString>;
                issued_at_ms: z.ZodNumber;
                expires_at_ms: z.ZodNumber;
                owner_epoch: z.ZodNumber;
                nonce: z.ZodString;
                recipient: z.ZodString;
                domain: z.ZodLiteral<"near-intents-agent-api.agent-grant.v3">;
                recipients: z.ZodArray<z.ZodString>;
            }, z.core.$strict>]>;
        }, z.core.$strict>>;
    }, z.core.$strict>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    swap: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodIntersection<z.ZodObject<{
        originAsset: z.ZodString;
        destinationAsset: z.ZodString;
        amount: z.ZodString;
        minAmountOut: z.ZodOptional<z.ZodString>;
        confidential: z.ZodDefault<z.ZodBoolean>;
        dry: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>>, z.ZodUnion<readonly [z.ZodObject<{
        dry: z.ZodLiteral<true>;
        type: z.ZodEnum<{
            swap: "swap";
            withdraw: "withdraw";
        }>;
        quote: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>, ...z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>[]], "type">]>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    withdraw: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodIntersection<z.ZodObject<{
        asset: z.ZodString;
        amount: z.ZodString;
        chain: z.ZodString;
        recipient: z.ZodString;
        memo: z.ZodOptional<z.ZodString>;
        confidential: z.ZodDefault<z.ZodBoolean>;
        async: z.ZodDefault<z.ZodBoolean>;
        dry: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>>, z.ZodUnion<readonly [z.ZodObject<{
        dry: z.ZodLiteral<true>;
        type: z.ZodEnum<{
            swap: "swap";
            withdraw: "withdraw";
        }>;
        quote: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>, ...z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>[]], "type">]>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    transfer: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodIntersection<z.ZodObject<{
        asset: z.ZodString;
        amount: z.ZodString;
        recipient: z.ZodString;
        confidential: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>, ...z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>[]], "type">, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    shield: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodIntersection<z.ZodObject<{
        asset: z.ZodString;
        amount: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>, ...z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>[]], "type">, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    unshield: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodIntersection<z.ZodObject<{
        asset: z.ZodString;
        amount: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>, ...z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>[]], "type">, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    confidentialDeposit: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodIntersection<z.ZodObject<{
        asset: z.ZodString;
        amount: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>, ...z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>[]], "type">, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    deposit: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodIntersection<z.ZodObject<{
        originAsset: z.ZodOptional<z.ZodString>;
        destinationAsset: z.ZodOptional<z.ZodString>;
        amount: z.ZodString;
        chain: z.ZodOptional<z.ZodString>;
        asset: z.ZodOptional<z.ZodString>;
        refundTo: z.ZodOptional<z.ZodString>;
        confidential: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>, ...z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>[]], "type">, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    recover: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodIntersection<z.ZodObject<{
        correlationId: z.ZodString;
        request: z.ZodDiscriminatedUnion<[z.ZodObject<{
            originAsset: z.ZodString;
            destinationAsset: z.ZodString;
            amount: z.ZodString;
            minAmountOut: z.ZodOptional<z.ZodString>;
            confidential: z.ZodDefault<z.ZodBoolean>;
            dry: z.ZodDefault<z.ZodBoolean>;
            type: z.ZodLiteral<"swap">;
        }, z.core.$strict>, z.ZodObject<{
            asset: z.ZodString;
            amount: z.ZodString;
            chain: z.ZodString;
            recipient: z.ZodString;
            memo: z.ZodOptional<z.ZodString>;
            confidential: z.ZodDefault<z.ZodBoolean>;
            async: z.ZodDefault<z.ZodBoolean>;
            dry: z.ZodDefault<z.ZodBoolean>;
            type: z.ZodLiteral<"withdraw">;
        }, z.core.$strict>, z.ZodObject<{
            asset: z.ZodString;
            amount: z.ZodString;
            recipient: z.ZodString;
            confidential: z.ZodDefault<z.ZodBoolean>;
            type: z.ZodLiteral<"transfer">;
        }, z.core.$strict>, z.ZodObject<{
            asset: z.ZodString;
            amount: z.ZodString;
            type: z.ZodLiteral<"shield">;
        }, z.core.$strict>, z.ZodObject<{
            asset: z.ZodString;
            amount: z.ZodString;
            type: z.ZodLiteral<"unshield">;
        }, z.core.$strict>, z.ZodObject<{
            asset: z.ZodString;
            amount: z.ZodString;
            type: z.ZodLiteral<"confidential_deposit">;
        }, z.core.$strict>], "type">;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>, ...z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>[]], "type">, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    signMessage: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodIntersection<z.ZodObject<{
        chain: z.ZodUnion<readonly [z.ZodLiteral<"near">, z.ZodEnum<{
            arbitrum: "arbitrum";
            avalanche: "avalanche";
            base: "base";
            bsc: "bsc";
            ethereum: "ethereum";
            optimism: "optimism";
            polygon: "polygon";
        }>]>;
        message: z.ZodString;
        encoding: z.ZodDefault<z.ZodEnum<{
            hex: "hex";
            utf8: "utf8";
        }>>;
        recipient: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>, z.ZodObject<{
        agentId: z.ZodString;
    }, z.core.$strip>>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>, ...z.ZodObject<{
        type: z.ZodLiteral<string>;
    }, z.core.$strip>[]], "type">, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
};
export type GenerateIntentInput = GenerateIntentRequest;
export type SubmitIntentInput = SubmitIntentRequest;
export type ContractType = typeof contract;
