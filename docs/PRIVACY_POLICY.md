# Privacy Policy for APHC Case Tracker

**Last Updated:** November 8, 2024
**Effective Date:** November 8, 2024
**Application Name:** APHC Case Tracker (Andhra Pradesh High Court Lawyer App)
**Entity Name:** [INSERT LEGAL ENTITY NAME / PROPRIETOR / DEVELOPER NAME]
**Registered Office:** [INSERT REGISTERED OFFICE ADDRESS, ANDHRA PRADESH / INDIA]
**Website / Web Portal:** [INSERT APPLICATION OFFICIAL WEBSITE OR PLAY STORE URL]
**Contact / Support Email:** [INSERT SUPPORT EMAIL ADDRESS, e.g., support@aphccasetracker.in]

---

## 1. Introduction and Scope

This Privacy Policy ("**Policy**") governs the collection, processing, storage, disclosure, transfer, and protection of personal data and digital information by **[INSERT LEGAL ENTITY NAME]** ("**Company**", "**we**", "**us**", or "**our**") in connection with the mobile application **APHC Case Tracker** (the "**Application**" or "**App**") and related backend application programming interfaces (APIs) and services (collectively, the "**Services**").

This Policy is formulated in strict compliance with:

1. **The Digital Personal Data Protection Act, 2023 ("DPDP Act")** and applicable rules framed thereunder;
2. **The Information Technology Act, 2000 ("IT Act")**, including Section 43A and the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 ("**SPDI Rules**");
3. **The Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021**;
4. **Google Play Store Developer Distribution Agreement and User Data Policies**, including Data Safety declarations, Permissions and Sensitive APIs policies, and Government Impersonation policies; and
5. Professional confidentiality and privilege ethics applicable to legal practitioners under the **Advocates Act, 1961**, the **Bar Council of India Rules**, and Section 132 of the **Bharatiya Sakshya Adhiniyam, 2023** (formerly Section 126 of the Indian Evidence Act, 1872).

By registering for, downloading, accessing, or using the Application, you ("**User**", "**Advocate**", or "**Data Principal**") acknowledge that you have read, understood, and consented to the collection and processing of your personal data as described in this Policy. If you do not agree with any provision of this Policy, you must refrain from using the Application.

---

## 2. Nature of the Application and Government Non-Affiliation

> ### **MANDATORY LEGAL NOTICE & NON-GOVERNMENT STATUS**
>
> **APHC Case Tracker is an independent legal practice productivity and case-management software application developed and maintained privately by [INSERT LEGAL ENTITY NAME].**
>
> **THE APPLICATION IS NOT AN OFFICIAL APPLICATION, PRODUCT, OR SERVICE OF THE HIGH COURT OF ANDHRA PRADESH, THE SUPREME COURT OF INDIA, THE GOVERNMENT OF ANDHRA PRADESH, OR THE GOVERNMENT OF INDIA. IT HAS NOT BEEN COMMISSIONED, ENDORSED, SPONSORED, CERTIFIED, OR OPERATED BY ANY JUDICIAL, STATUTORY, OR GOVERNMENTAL ENTITY.**
>
> All judicial docket data, cause lists, case statuses, and judgments accessed or organized through this Application are derived from publicly accessible judicial records published on the official web portal of the High Court of Andhra Pradesh at [https://aphc.gov.in](https://aphc.gov.in) and the national e-Courts Services portal at [https://services.ecourts.gov.in](https://services.ecourts.gov.in).

---

## 3. Categories of Data Collected

We collect and process only such personal data as is strictly necessary and proportionate to deliver, secure, and maintain the case-tracking and calendar services.

### A. Advocate Profile & Identity Data

- **Full Legal Name:** Provided during account creation to personalize notifications and court cause list matching.
- **Bar Council Enrollment Number:** Format `AP/XXXX/YYYY` (or other State Bar Council equivalent). Collected to verify advocate eligibility, prevent unauthorized access, and auto-filter causelist appearances.
- **Email Address:** Used for account authentication, single-use One-Time Password (OTP) verification, password resets, critical court listing alerts, and regulatory notifications.
- **Mobile Telephone Number:** Optional or provided for SMS OTP delivery and urgent listing alerts.
- **Chamber / Professional Address:** Optional professional address for profile completeness and team collaboration.
- **Professional Role:** Classification (e.g., Senior Advocate, Junior Associate, Independent Counsel, Chamber Clerk).
- **Language Preference:** Preference selection (English, Telugu `తెలుగు`, or Hindi `हिन्दी`) for UI rendering and text-to-speech pronunciations.

### B. Tracked Case Dockets & Professional Practice Information

- **Case Reference Identifiers:** Case type (e.g., Writ Petition `WP`, Criminal Petition `Crl.P`, Appeal `WA`, etc.), case registration number, and filing year.
- **Litigant Names:** Names of petitioners and respondents as recorded in public court filings.
- **Advocate-on-Record Names:** Names of counsel for petitioner and respondent.
- **Court Schedule Data:** Next hearing date, listing serial number, court hall number, and assigned judicial bench.
- **User-Created Case Notes & Hearing Summaries:** Private textual observations, task reminders, and personal case notes recorded by the advocate.

### C. Voice Data & Audio Recordings

- **Voice Queries:** Spoken search commands (e.g., "WP 101 of 2024", "Ramesh Kumar matter") captured via microphone for in-app search navigation.
- **Case Audio Notes:** Spoken voice memos recorded by the advocate attached to a specific case docket (maximum duration: 600 seconds / 10 minutes per recording; maximum upload size: 25 MB).
- **Voice Transcripts:** Machine-generated text transcriptions produced from voice notes in English, Telugu, or Hindi.

### D. Device, Network, and Telemetry Data

- **Push Notification Tokens:** Unique device registration tokens issued by Expo Push Notification Service and Google Firebase Cloud Messaging (FCM) to deliver real-time cause list token alerts and hearing reminders.
- **Technical Device Identifiers:** Operating system version (e.g., Android 14), device model/brand, application build version, and unique installation instance ID.
- **Network & Server Logs:** Internet Protocol (IP) address, access timestamps, HTTP request headers, and user agent strings collected during API interactions to maintain rate limiting and cybersecurity defenses.

### E. What We DO NOT Collect

- **NO Financial or Payment Data:** We do not collect credit card, debit card, UPI PINs, or bank account credentials.
- **NO Precise GPS Location:** The Application does not request or access GPS location permissions (`ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION`).
- **NO Contact Book Access:** We do not read, scrape, or upload your address book or device contacts (`READ_CONTACTS`).
- **NO Camera Access:** The Application does not request camera permissions.
- **NO Ambient or Background Eavesdropping:** The microphone is activated strictly upon explicit user interaction within the voice search or voice memo screen and ceases immediately when stopped or closed.

---

## 4. Lawful Grounds and Purposes of Data Processing

Under Section 4 and Section 6 of the DPDP Act, 2023, data is processed lawfully either with the **explicit consent** of the Data Principal or for **legitimate legal practice facilitation**:

| Processing Purpose                                  | Lawful Ground (DPDP Act)                      | Data Categories Involved                                           |
| :-------------------------------------------------- | :-------------------------------------------- | :----------------------------------------------------------------- |
| **Advocate Account Authentication & Security**      | Section 6 (Consent & Contractual Necessity)   | Bar Enrollment ID, Email, Phone, Hashed Credentials, OTPs, IP logs |
| **Cause List Token Alerts & Hearing Notifications** | Section 6 (Explicit Consent)                  | Push Notification Tokens, Case Identifiers, Hearing Dates          |
| **Personal Case Tracking & Docket Organization**    | Section 6 (Consent / Service Delivery)        | Case Types, Numbers, Litigants, Hearing Dates, User Notes          |
| **Voice Search & Speech-to-Text Transcription**     | Section 6 (Explicit Granular Consent)         | Microphone Audio Streams, Audio Files, Transcription Texts         |
| **Text-to-Speech Court Announcement**               | Section 6 (Consent / Local Processing)        | Selected Language, Cause List Court Numbers                        |
| **Audit Logs, Prevention of Abuse & Fraud**         | Section 7 / Section 8 (Security & Compliance) | IP Addresses, Session Tokens, API Timestamps, Failed OTP attempts  |

---

## 5. Voice & Microphone Data Processing Policy

The Application integrates voice search and voice note recording functionalities to assist advocates during busy court hours. In accordance with Google Play's User Data & Permissions Policies:

1. **Granular Consent Prior to Access:** The Application requests the Android runtime permission `RECORD_AUDIO` only when you deliberately tap the microphone icon within the Voice Search Modal or Case Voice Note recorder.
2. **In-Context Visual Indicator:** While audio is being recorded, a pulsating visual indicator and prominent status label ("Listening..." / "Recording...") is displayed on screen.
3. **No Background Recording:** The Application never records audio in the background or when the Application is minimized. Audio recording terminates automatically when the modal is closed or the 10-minute maximum limit is reached.
4. **Speech-to-Text Engine:**
   - **Voice Search Queries:** Voice queries for searching cases are converted into text using on-device speech engines or secure speech recognition APIs. Transient audio buffers used for search queries are discarded immediately after transcription and are **never** persisted on our servers.
   - **Case Voice Notes:** If an advocate elects to save a voice note for a case docket, the resulting audio file (`.m4a`) is encrypted and transmitted over HTTPS to our secure backend storage. Transcription is performed asynchronously to produce a written memorandum for the advocate's private reference.
5. **Advocate Deletion Rights:** Advocates may permanently delete any voice note and its associated audio file and transcript at any time directly through the Application UI. Deletion triggers immediate unlinking from the case and permanent deletion from our underlying storage volumes within twenty-four (24) hours.

---

## 6. Third-Party Service Providers and Data Disclosures

We do not sell, rent, monetize, or trade personal data or legal case information to data brokers, advertisers, or commercial third parties. Data is shared strictly with vetted infrastructure sub-processors essential to operate the App:

| Third-Party Sub-Processor                      | Role / Function                                 | Data Disclosed                                                                     | Location & Safeguards                                              |
| :--------------------------------------------- | :---------------------------------------------- | :--------------------------------------------------------------------------------- | :----------------------------------------------------------------- |
| **Google Cloud Platform / Firebase (FCM)**     | Push Notification Delivery & Speech Processing  | Device Push Tokens, Encrypted notification payloads, Audio streams (transient STT) | India / Global Data Centers; SOC 2 Type II, ISO 27001 certified    |
| **Expo (650 Industries, Inc.)**                | Push Notification Routing Infrastructure        | Device Push Tokens, App Version                                                    | TLS 1.3 transit encryption; strict non-storage of payload contents |
| **High Court Public Portal (`aphc.gov.in`)**   | Public Cause List & Case Status Synchronization | Case numbers & Enrollment IDs queried against public records                       | Government of India servers; public data query only                |
| **PostgreSQL & Cloud Infrastructure Provider** | Encrypted Database & Media File Hosting         | Encrypted Advocate Profiles, Case Dockets, Voice Notes                             | Dedicated servers located in India; encrypted at rest              |

We may disclose personal data to law enforcement, judicial authorities, or regulatory bodies only when strictly mandated by a valid court order, summons, or statutory warrant under Indian law.

---

## 7. Advocate-Client Privilege & Legal Professional Confidentiality

We recognize that advocates using this Application owe strict statutory and fiduciary duties of confidentiality to their clients under Section 126 of the Indian Evidence Act, 1872 (now Section 132 of the Bharatiya Sakshya Adhiniyam, 2023) and Bar Council of India standards:

- **Private Work Product:** All personal case notes, strategy memos, client reminders, and voice recordings created by an advocate inside the Application are treated as confidential, privileged legal work product.
- **Zero AI Training on Private Data:** We explicitly warrant that private case notes, voice memos, and client details are **never** used to train public machine learning or artificial intelligence models.
- **No Third-Party Access:** Our technical personnel have no access to decrypted private case notes or audio memos, except where strictly required for debugging upon the advocate's express, authenticated support ticket request.

---

## 8. Data Storage, Security, and Encryption Practices

In accordance with Section 8(5) of the DPDP Act and the SPDI Rules, we implement reasonable and state-of-the-art administrative, technical, and physical security measures:

1. **Encryption in Transit:** All communications between the mobile application, backend Django REST APIs, and external services are encrypted using Transport Layer Security (**TLS 1.2 / TLS 1.3**) with HTTP Strict Transport Security (HSTS) and perfect forward secrecy.
2. **Client-Side Hardware-Backed Encryption:**
   - User authentication JWT tokens (access and refresh tokens) are stored using `Expo SecureStore`, which leverages the Android KeyStore and `EncryptedSharedPreferences` backed by hardware security modules (TEE/SE).
   - Locally cached case records and offline dockets are encrypted at rest using Advanced Encryption Standard (**AES-256**) via cryptographic routines before writing to device storage.
3. **Server-Side File Segregation (`SecureDocumentStorage`):**
   - User-uploaded voice notes and legal case documents are stored in protected storage directories located strictly outside the public web root.
   - Files are accessible solely via authenticated, authorization-checked API endpoints (`VoiceNoteAudioStreamView`) that verify advocate ownership before streaming. Public web URLs to audio files do not exist.
4. **Brute-Force & Enumeration Defenses:** Authentication, registration, and OTP endpoints are protected by scoped rate-limiters (`ScopedRateThrottle`) to prevent credential stuffing and account enumeration attacks.
5. **Periodic Telemetry Pruning:** Ephemeral real-time websocket and cause list sync event logs are routinely pruned by automated Celery tasks (`prune_realtime_events`) to prevent unnecessary data accumulation.

---

## 9. Data Retention and Erasure Schedules

We retain personal data only for as long as necessary to fulfill the operational purposes set forth in this Policy, or as required by statutory retention obligations under Indian law:

- **Active Advocate Account Data:** Retained for the lifetime of the active account.
- **Case Dockets & Notes:** Retained until deleted by the advocate or upon account termination.
- **Voice Audio Recordings (`.m4a`):** Retained while the voice note remains active; permanently deleted within 24 hours of user deletion or account closure.
- **OTP Verification Records:** Cryptographic verification OTP records automatically expire within ten (10) minutes of issuance and are purged from the database after expiration.
- **Audit & Security Access Logs:** Retained for a maximum period of one hundred and eighty (180) days for cybersecurity auditing in compliance with CERT-In directions under Section 70B of the IT Act, after which they are irreversibly overwritten or anonymized.

---

## 10. Data Principal Rights under the DPDP Act, 2023

Under Chapter III of the DPDP Act, 2023, every advocate (Data Principal) is entitled to the following statutory rights regarding their personal data:

1. **Right to Access Information (Section 11):** You have the right to obtain a summary of your personal data being processed, the identities of all third parties with whom data has been shared, and related processing information.
2. **Right to Correction and Erasure (Section 12):** You have the right to request correction of inaccurate or misleading data, completion of incomplete data, updating of obsolete data, and erasure of personal data that is no longer necessary.
3. **Right of Grievance Redressal (Section 13):** You have the right to accessible and expeditious grievance redressal provided by our designated Grievance Officer.
4. **Right to Nominate (Section 14):** You have the right to nominate any other individual who, in the event of your death or incapacity, shall exercise your rights as a Data Principal under the DPDP Act.
5. **Right to Withdraw Consent:** Where processing is based on consent, you may withdraw your consent at any time via in-app controls or by emailing our Grievance Officer. Withdrawal of consent does not affect the lawfulness of processing undertaken prior to withdrawal.

To exercise any of these rights, submit a written request to our Grievance Officer at the contact details provided in Section 15.

---

## 11. Account Deletion and Data Removal Procedure (Google Play & DPDP Compliance)

In compliance with Google Play's Account Deletion Policy and Section 12(3) of the DPDP Act, advocates may request the complete deletion of their account and all associated personal data through either of the following methods:

### Method 1: In-App Account Deletion

1. Open the **APHC Case Tracker** mobile application.
2. Navigate to **Settings** (`Tabs > Settings`).
3. Scroll to the **Account & Legal** section.
4. Tap **Request Account Deletion**.
5. Confirm your identity by entering your registered account password or verifying an OTP sent to your registered email address.
6. Upon confirmation, your session is invalidated immediately, and your account is queued for permanent erasure.

### Method 2: Web-Based Deletion Request (Dedicated Web Form)

If you have uninstalled the application or cannot access your mobile device:

1. Visit our dedicated Web Deletion Portal: **[INSERT ACCOUNT DELETION URL, e.g., https://aphccasetracker.in/delete-account]**
2. Enter your registered Bar Council Enrollment Number and registered Email Address.
3. Complete the email verification link dispatched to your inbox.
4. Confirm deletion of your account.

### What Happens Upon Deletion:

- **Immediate Action:** Access to your account is disabled immediately; JWT session tokens are blacklisted; push notification device tokens are deregistered.
- **Permanent Purge:** Within thirty (30) calendar days of a verified request, your advocate profile, chamber address, personal case tracking dockets, private notes, voice notes, audio files, and transcripts are permanently deleted or irreversibly anonymized from our primary databases and backup archives.
- **Exceptions:** We may retain minimal transactional logs solely where mandated by statutory compliance, tax audits, or legal defense against pending litigation under Indian law.

---

## 12. Children’s Privacy and Age Restrictions

The Application is designed, developed, and offered exclusively to qualified legal practitioners, law clerks, and advocates who are at least eighteen (18) years of age and eligible to practice law.

We do not knowingly collect, solicit, or process personal data from children under eighteen (18) years of age, in accordance with Section 9 of the DPDP Act, 2023. If we become aware that personal data of a minor has been inadvertently collected, we will take immediate steps to delete such data and terminate the corresponding account.

---

## 13. Cross-Border Data Transfers

All primary databases, file servers, and backup repositories housing personal data collected through the Application are physically hosted on secure cloud infrastructure located within the sovereign territory of **India**.

To the extent that any data is processed via global sub-processors (such as Google Firebase Cloud Messaging for push dispatch), such processing is conducted strictly in compliance with Section 16 of the DPDP Act, 2023 and restrictions notified by the Central Government of India.

---

## 14. Changes and Updates to this Privacy Policy

We may update or modify this Privacy Policy from time to time to reflect changes in our legal obligations, operational features, or technological standards. When material changes are made, we will notify you through:

1. A prominent in-app banner or alert notification upon your next login; and/or
2. An email sent to your registered email address.

The "Last Updated" date at the top of this document indicates the date of the latest revisions. Your continued use of the Application after the effective date of an amended Policy constitutes your acceptance of the updated terms.

---

## 15. Grievance Redressal Mechanism & Data Protection Officer

In compliance with Section 8(10) of the DPDP Act, 2023 and Rule 5(9) of the SPDI Rules, 2011, we have appointed a dedicated **Grievance Officer** based in India to handle privacy concerns, data rights requests, and security incidents.

### Contact Details of the Grievance Officer:

- **Name:** [INSERT GRIEVANCE OFFICER NAME, e.g., Sri. R. Venkateswarlu, Advocate / Compliance Officer]
- **Designation:** Grievance Redressal Officer & Data Protection Officer
- **Entity Name:** [INSERT LEGAL ENTITY NAME]
- **Postal Address:** [INSERT COMPLETE POSTAL ADDRESS WITH PIN CODE, e.g., Flat No. 402, Judicial Enclave, Tadepalli, Guntur District, Andhra Pradesh - 522501, India]
- **Dedicated Grievance Email:** [INSERT GRIEVANCE EMAIL, e.g., grievance@aphccasetracker.in / privacy@aphccasetracker.in]
- **Contact Telephone:** [INSERT TELEPHONE / HELPLINE NUMBER, e.g., +91 866 XXXXXXX]
- **Working Hours:** Monday to Friday, 10:00 AM to 5:00 PM IST (excluding Court holidays)

### Grievance Escalation & Resolution Timeline:

1. **Acknowledgment:** All written privacy complaints and requests submitted to the Grievance Officer will be acknowledged within **forty-eight (48) hours** of receipt.
2. **Resolution:** We will investigate and resolve complaints within **thirty (30) calendar days** from the date of receipt, or within such shorter timeframe as may be prescribed under DPDP Act rules.
3. **Escalation to Data Protection Board:** If you are not satisfied with the resolution provided by our Grievance Officer, you have the statutory right under Section 13(3) of the DPDP Act to file a complaint before the **Data Protection Board of India**.

---

_This document constitutes an electronic record published in accordance with the provisions of Rule 3(1) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021._
