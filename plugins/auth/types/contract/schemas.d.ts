import { z } from "zod";
export declare const nearIdentitySchema: z.ZodObject<{
    accountId: z.ZodString;
    network: z.ZodString;
    publicKey: z.ZodString;
    isPrimary: z.ZodBoolean;
}, z.core.$strip>;
export declare const nearCapabilitiesSchema: z.ZodObject<{
    primaryAccountId: z.ZodNullable<z.ZodString>;
    linkedAccounts: z.ZodArray<z.ZodObject<{
        accountId: z.ZodString;
        network: z.ZodString;
        publicKey: z.ZodString;
        isPrimary: z.ZodBoolean;
    }, z.core.$strip>>;
    hasNearAccount: z.ZodBoolean;
}, z.core.$strip>;
export declare const organizationMemberSchema: z.ZodObject<{
    id: z.ZodString;
    role: z.ZodString;
}, z.core.$strip>;
export declare const organizationInfoSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
    logo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    status: z.ZodDefault<z.ZodEnum<{
        active: "active";
        pending: "pending";
        rejected: "rejected";
    }>>;
    requestedBy: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rejectionReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const teamContextSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    areas: z.ZodArray<z.ZodString>;
    permissions: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const organizationContextSchema: z.ZodObject<{
    activeOrganizationId: z.ZodNullable<z.ZodString>;
    organization: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        slug: z.ZodString;
        logo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        metadata: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
        status: z.ZodDefault<z.ZodEnum<{
            active: "active";
            pending: "pending";
            rejected: "rejected";
        }>>;
        requestedBy: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        rejectionReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
    member: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        role: z.ZodString;
    }, z.core.$strip>>;
    isPersonal: z.ZodBoolean;
    hasOrganization: z.ZodBoolean;
    teams: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        areas: z.ZodArray<z.ZodString>;
        permissions: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    activeTeamId: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const sessionUserSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    emailVerified: z.ZodBoolean;
    image: z.ZodNullable<z.ZodString>;
    role: z.ZodNullable<z.ZodString>;
    isAnonymous: z.ZodNullable<z.ZodBoolean>;
    locale: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const sessionDataSchema: z.ZodObject<{
    session: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        token: z.ZodString;
        userId: z.ZodString;
        expiresAt: z.ZodDate;
        activeOrganizationId: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    user: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        email: z.ZodString;
        emailVerified: z.ZodBoolean;
        image: z.ZodNullable<z.ZodString>;
        role: z.ZodNullable<z.ZodString>;
        isAnonymous: z.ZodNullable<z.ZodBoolean>;
        locale: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const userPrincipalSchema: z.ZodObject<{
    type: z.ZodLiteral<"user">;
    userId: z.ZodString;
    user: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        email: z.ZodString;
        emailVerified: z.ZodBoolean;
        image: z.ZodNullable<z.ZodString>;
        role: z.ZodNullable<z.ZodString>;
        isAnonymous: z.ZodNullable<z.ZodBoolean>;
        locale: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const organizationPrincipalSchema: z.ZodObject<{
    type: z.ZodLiteral<"organization">;
    organizationId: z.ZodString;
}, z.core.$strip>;
export declare const anonymousPrincipalSchema: z.ZodObject<{
    type: z.ZodLiteral<"anonymous">;
    userId: z.ZodString;
    user: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        email: z.ZodString;
        emailVerified: z.ZodBoolean;
        image: z.ZodNullable<z.ZodString>;
        role: z.ZodNullable<z.ZodString>;
        isAnonymous: z.ZodNullable<z.ZodBoolean>;
        locale: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const principalSchema: z.ZodUnion<readonly [z.ZodObject<{
    type: z.ZodLiteral<"user">;
    userId: z.ZodString;
    user: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        email: z.ZodString;
        emailVerified: z.ZodBoolean;
        image: z.ZodNullable<z.ZodString>;
        role: z.ZodNullable<z.ZodString>;
        isAnonymous: z.ZodNullable<z.ZodBoolean>;
        locale: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"organization">;
    organizationId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"anonymous">;
    userId: z.ZodString;
    user: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        email: z.ZodString;
        emailVerified: z.ZodBoolean;
        image: z.ZodNullable<z.ZodString>;
        role: z.ZodNullable<z.ZodString>;
        isAnonymous: z.ZodNullable<z.ZodBoolean>;
        locale: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>]>;
export declare const apiKeyContextSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    permissions: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
}, z.core.$strip>;
export declare const requestContextSchema: z.ZodObject<{
    user: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        email: z.ZodString;
        emailVerified: z.ZodBoolean;
        image: z.ZodNullable<z.ZodString>;
        role: z.ZodNullable<z.ZodString>;
        isAnonymous: z.ZodNullable<z.ZodBoolean>;
        locale: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    userId: z.ZodNullable<z.ZodString>;
    isAuthenticated: z.ZodBoolean;
    authMethod: z.ZodEnum<{
        anonymous: "anonymous";
        apiKey: "apiKey";
        none: "none";
        session: "session";
    }>;
    principal: z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
        type: z.ZodLiteral<"user">;
        userId: z.ZodString;
        user: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            email: z.ZodString;
            emailVerified: z.ZodBoolean;
            image: z.ZodNullable<z.ZodString>;
            role: z.ZodNullable<z.ZodString>;
            isAnonymous: z.ZodNullable<z.ZodBoolean>;
            locale: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"organization">;
        organizationId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"anonymous">;
        userId: z.ZodString;
        user: z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            email: z.ZodString;
            emailVerified: z.ZodBoolean;
            image: z.ZodNullable<z.ZodString>;
            role: z.ZodNullable<z.ZodString>;
            isAnonymous: z.ZodNullable<z.ZodBoolean>;
            locale: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>]>>;
    apiKey: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        permissions: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
    }, z.core.$strip>>;
    permissions: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
    near: z.ZodObject<{
        primaryAccountId: z.ZodNullable<z.ZodString>;
        linkedAccounts: z.ZodArray<z.ZodObject<{
            accountId: z.ZodString;
            network: z.ZodString;
            publicKey: z.ZodString;
            isPrimary: z.ZodBoolean;
        }, z.core.$strip>>;
        hasNearAccount: z.ZodBoolean;
    }, z.core.$strip>;
    organization: z.ZodObject<{
        activeOrganizationId: z.ZodNullable<z.ZodString>;
        organization: z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            slug: z.ZodString;
            logo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            metadata: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
            status: z.ZodDefault<z.ZodEnum<{
                active: "active";
                pending: "pending";
                rejected: "rejected";
            }>>;
            requestedBy: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            rejectionReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>;
        member: z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            role: z.ZodString;
        }, z.core.$strip>>;
        isPersonal: z.ZodBoolean;
        hasOrganization: z.ZodBoolean;
        teams: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            areas: z.ZodArray<z.ZodString>;
            permissions: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        activeTeamId: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    organizations: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        role: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        slug: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const apiKeySchema: z.ZodObject<{
    id: z.ZodString;
    configId: z.ZodString;
    referenceId: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    prefix: z.ZodNullable<z.ZodString>;
    start: z.ZodNullable<z.ZodString>;
    enabled: z.ZodBoolean;
    rateLimitEnabled: z.ZodBoolean;
    rateLimitMax: z.ZodNullable<z.ZodNumber>;
    rateLimitTimeWindow: z.ZodNullable<z.ZodNumber>;
    remaining: z.ZodNullable<z.ZodNumber>;
    requestCount: z.ZodNumber;
    lastRequest: z.ZodNullable<z.ZodDate>;
    expiresAt: z.ZodNullable<z.ZodDate>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    metadata: z.ZodNullable<z.ZodUnknown>;
    permissions: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
}, z.core.$strip>;
export declare const apiKeyRateLimitSchema: z.ZodObject<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    timeWindow: z.ZodOptional<z.ZodNumber>;
    max: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const memberSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    organizationId: z.ZodString;
    role: z.ZodString;
    createdAt: z.ZodDate;
}, z.core.$strip>;
export declare const memberWithUserSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    organizationId: z.ZodString;
    role: z.ZodString;
    createdAt: z.ZodDate;
    user: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        email: z.ZodNullable<z.ZodString>;
        image: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const invitationSchema: z.ZodObject<{
    id: z.ZodString;
    organizationId: z.ZodString;
    email: z.ZodNullable<z.ZodString>;
    role: z.ZodNullable<z.ZodString>;
    status: z.ZodString;
    expiresAt: z.ZodDate;
    inviterId: z.ZodString;
    teamId: z.ZodNullable<z.ZodString>;
    nearAccountId: z.ZodNullable<z.ZodString>;
    nearNetwork: z.ZodNullable<z.ZodEnum<{
        mainnet: "mainnet";
        testnet: "testnet";
    }>>;
}, z.core.$strip>;
export declare const teamSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    organizationId: z.ZodString;
    areas: z.ZodArray<z.ZodString>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, z.core.$strip>;
export declare const teamMemberSchema: z.ZodObject<{
    id: z.ZodString;
    teamId: z.ZodString;
    userId: z.ZodString;
    role: z.ZodString;
    createdAt: z.ZodDate;
}, z.core.$strip>;
export declare const adminUserSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    emailVerified: z.ZodBoolean;
    image: z.ZodNullable<z.ZodString>;
    isAnonymous: z.ZodNullable<z.ZodBoolean>;
    locale: z.ZodNullable<z.ZodString>;
    role: z.ZodNullable<z.ZodString>;
    banned: z.ZodNullable<z.ZodBoolean>;
    banReason: z.ZodNullable<z.ZodString>;
    banExpires: z.ZodNullable<z.ZodDate>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, z.core.$strip>;
export declare const adminSessionSchema: z.ZodObject<{
    id: z.ZodString;
    token: z.ZodString;
    userId: z.ZodString;
    expiresAt: z.ZodDate;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    ipAddress: z.ZodNullable<z.ZodString>;
    userAgent: z.ZodNullable<z.ZodString>;
    impersonatedBy: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const passkeySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    publicKey: z.ZodString;
    userId: z.ZodString;
    credentialID: z.ZodString;
    counter: z.ZodNumber;
    deviceType: z.ZodString;
    backedUp: z.ZodBoolean;
    transports: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodDate;
    aaguid: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const onboardingCodeSummarySchema: z.ZodObject<{
    id: z.ZodString;
    eventId: z.ZodNullable<z.ZodString>;
    eventName: z.ZodString;
    teamId: z.ZodString;
    role: z.ZodString;
    maxUses: z.ZodNumber;
    usedCount: z.ZodNumber;
    expiresAt: z.ZodDate;
    revokedAt: z.ZodNullable<z.ZodDate>;
    createdAt: z.ZodDate;
}, z.core.$strip>;
export declare const daoOutputSchema: z.ZodObject<{
    daoAccountId: z.ZodNullable<z.ZodString>;
    daoNetwork: z.ZodNullable<z.ZodEnum<{
        mainnet: "mainnet";
        testnet: "testnet";
    }>>;
}, z.core.$strip>;
export declare const signedMessageSchema: z.ZodObject<{
    accountId: z.ZodString;
    publicKey: z.ZodString;
    signature: z.ZodString;
    state: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const nearAccountSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    accountId: z.ZodString;
    network: z.ZodString;
    publicKey: z.ZodString;
    providerId: z.ZodOptional<z.ZodLiteral<"siwn">>;
    isPrimary: z.ZodBoolean;
    isActive: z.ZodOptional<z.ZodBoolean>;
    isAvailable: z.ZodOptional<z.ZodBoolean>;
    createdAt: z.ZodDate;
}, z.core.$strip>;
export declare const socialImageSchema: z.ZodObject<{
    url: z.ZodOptional<z.ZodString>;
    ipfs_cid: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const profileOutputSchema: z.ZodNullable<z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    image: z.ZodOptional<z.ZodObject<{
        url: z.ZodOptional<z.ZodString>;
        ipfs_cid: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    backgroundImage: z.ZodOptional<z.ZodObject<{
        url: z.ZodOptional<z.ZodString>;
        ipfs_cid: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    linktree: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>>;
export declare const relayedTransactionSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    txHash: z.ZodString;
    senderId: z.ZodString;
    receiverId: z.ZodString;
    network: z.ZodString;
    status: z.ZodString;
    gasUsed: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const relayerInfoOutputSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    accountId: z.ZodOptional<z.ZodString>;
    mode: z.ZodOptional<z.ZodEnum<{
        ephemeral: "ephemeral";
        explicit: "explicit";
    }>>;
    network: z.ZodOptional<z.ZodEnum<{
        mainnet: "mainnet";
        testnet: "testnet";
    }>>;
    balance: z.ZodOptional<z.ZodString>;
    available: z.ZodOptional<z.ZodString>;
    staked: z.ZodOptional<z.ZodString>;
    storageUsage: z.ZodOptional<z.ZodString>;
    storageBytes: z.ZodOptional<z.ZodNumber>;
    hasContract: z.ZodOptional<z.ZodBoolean>;
    hasKey: z.ZodOptional<z.ZodBoolean>;
    publicKey: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodString>;
    lastUsedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
