# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Dependency Security

### Axios Supply Chain Attack Protection (March 2026)

This repository has implemented protections against the Axios npm supply chain compromise (CVE related to malicious versions 1.14.1 and 0.30.4).

**Current Protections:**
- Lifecycle scripts disabled via `bunfig.toml` (`ignore-scripts = true`)
- Security audit integrated into CI/CD pipeline (`bun audit`, gated by `AUDIT_STRICT` secret)
- Renovate manages dependency updates with `vulnerabilityAlerts` enabled
- Catalog pinning in root `package.json` locks shared dependency versions across all workspaces

**Review Date:** May 2, 2026 (30 days from implementation)

### Dependency Update Policy

1. **Manual Review Required:** All dependency updates must be manually reviewed
2. **Renovate Managed:** Renovate opens PRs for updates; minor bumps are never auto-merged
3. **Security Audits:** Run `bun audit` before merging dependency changes
4. **Lock File:** Always commit lock file changes with dependency updates

## Reporting a Vulnerability

**DO NOT** open a public GitHub issue for security vulnerabilities.

### Reporting Process

1. Email security concerns to the repository maintainers
2. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)

### Response Timeline

- **Initial Response:** Within 48 hours
- **Status Update:** Within 7 days
- **Resolution:** Critical vulnerabilities addressed within 14 days

## Incident Response Plan

### If a Supply Chain Attack is Detected

1. **Immediate Actions:**
   - Stop all CI/CD pipelines
   - Isolate affected systems
   - Do NOT run `npm install` or `bun install` until verified

2. **Assessment:**
   - Check for malicious package versions in `node_modules`
   - Review CI/CD logs for suspicious activity
   - Scan for indicators of compromise (IOCs)
   - Check network logs for C2 connections

3. **Remediation:**
   - Rotate all secrets and credentials exposed to affected systems
   - Remove and reinstall dependencies from clean state
   - Update pinned versions to known-safe releases
   - Review and update override configurations

4. **Recovery:**
   - Verify all systems are clean before resuming operations
   - Document incident and lessons learned
   - Update security measures based on findings

### Known Indicators of Compromise (IOCs)

**Malicious Axios Versions:**
- axios@1.14.1
- axios@0.30.4

**Malicious Dependency:**
- plain-crypto-js@4.2.1

**C2 Infrastructure:**
- Domain: sfrclak[.]com
- IP: 142.11.206[.]73
- Port: 8000
- URL: hxxp://sfrclak[.]com:8000/6202033

**Malicious Files:**
- Windows: `%TEMP%\6202033.vbs`, `%TEMP%\6202033.ps1`, `%PROGRAMDATA%\system.bat`, `C:\ProgramData\wt.exe`
- macOS: `/Library/Caches/com.apple.act.mond`
- Linux: `/tmp/ld.py`

## Security Best Practices

### For Developers

1. **Never use `^` or `~` for critical dependencies** - Use exact versions
2. **Review package changes** - Check what changed before updating
3. **Use `bun install --ignore-scripts`** - When possible, skip lifecycle scripts
4. **Monitor dependencies** - Subscribe to security advisories
5. **Rotate credentials regularly** - Especially after dependency updates

### For CI/CD

1. **Pin all dependencies** - Use exact versions in `package.json`
2. **Use lock files** - Always commit `bun.lock`
3. **Run security audits** - Integrate `bun audit` in pipelines
4. **Limit permissions** - Use minimal required permissions for workflows
5. **Monitor logs** - Review CI/CD logs for anomalies

## Security Resources

- [Microsoft Security Blog - Axios Supply Chain Attack](https://www.microsoft.com/en-us/security/blog/2026/04/01/mitigating-the-axios-npm-supply-chain-compromise/)
- [npm Security Best Practices](https://docs.npmjs.com/packages-and-modules/securing-your-project)
- [GitHub Security Advisories](https://github.com/advisories)

## Changelog

### April 2, 2026
- Implemented Axios supply chain attack protections
- Added lifecycle script blocking
- Integrated security audit into CI/CD
- Created incident response plan
