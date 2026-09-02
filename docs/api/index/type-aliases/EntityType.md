[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / EntityType

# Type Alias: EntityType

> **EntityType** = `"EMAIL"` \| `"PHONE"` \| `"IP_ADDRESS"` \| `"MAC_ADDRESS"` \| `"URL_WITH_CREDENTIALS"` \| `"CREDIT_CARD"` \| `"IBAN"` \| `"SWIFT_BIC"` \| `"US_ROUTING_NUMBER"` \| `"UK_SORT_CODE"` \| `"CA_TRANSIT_NUMBER"` \| `"AU_BSB"` \| `"IN_IFSC"` \| `"BR_AGENCIA"` \| `"CRYPTO_WALLET"` \| `"NATIONAL_ID"` \| `"TAX_ID"` \| `"VAT_NUMBER"` \| `"PASSPORT_MRZ"` \| `"DRIVERS_LICENSE"` \| `"VIN"` \| `"US_NPI"` \| `"HEALTH_DATA"` \| `"API_KEY"` \| `"PRIVATE_KEY"` \| `"JWT"` \| `"GENERIC_SECRET"` \| `"CONNECTION_STRING"` \| `"POSTAL_CODE"` \| `"STREET_ADDRESS"` \| `"COORDINATES"` \| `"PERSON"` \| `"ORG"` \| `"LOCATION"` \| `"DATE_OF_BIRTH"`

Defined in: [packages/core/src/types.ts:39](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L39)

Every entity type the pipeline can detect, grouped as SPEC.md groups them.

Three deliberate design choices, each recorded in ARCHITECTURE.md:

 1. National identifiers are FAMILIES, not one member per country. SPEC.md
    requires that "adding a new national identifier must require touching
    exactly one new file" — a per-country union member would force every
    new scheme to edit this file too, breaking that requirement. The
    concrete scheme (SSN, TCKN, PESEL, Aadhaar, …) and its country travel
    in Candidate.metadata. The substitution section's singular
    "NATIONAL_ID → a value passing that country's checksum" confirms the
    family reading.
 2. Tax and VAT registrations are split out from NATIONAL_ID because their
    sensitivity genuinely differs — a company VAT number is often public
    registry data, a personal national ID never is — so the sensitivity
    profiles must be able to threshold them independently.
 3. PEM private keys get their own member rather than sharing API_KEY.
    SPEC.md lists them in the same bullet, but a leaked private key and a
    leaked API key differ in blast radius and in how each is surrogated.
