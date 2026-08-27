# Third-Party Notices

This project incorporates material from the projects listed below.

---

## Unicode® Character Database — Security Data (confusables.txt)

`packages/data/src/confusables.ts` is generated from the Unicode Consortium's
security data file `confusables.txt` by
`packages/data/scripts/build-confusables.ts`. The generated module is a
derived work: the source lines are parsed, their skeleton sequences are
NFKC-normalized, identity mappings are dropped, and each entry is annotated
with the script of its source character and of its skeleton.

- Source: <https://www.unicode.org/Public/security/latest/confusables.txt>
- Unicode version used: 17.0.0
- Terms of Use: <https://www.unicode.org/copyright.html>

The Unicode License v3 permits redistribution provided its copyright and
permission notice appears either with all copies of the data files or in
associated documentation. This file is that documentation.

### UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 1991-2026 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.

---

Unicode and the Unicode Logo are registered trademarks of Unicode, Inc. in
the United States and other countries.

---

## GeoNames

`packages/data/src/gazetteers.ts` contains a membership filter derived from the
GeoNames geographical database — the `cities15000`, `countryInfo` and
`admin1CodesASCII` exports, including native-script alternate names.

GeoNames data is licensed under the Creative Commons Attribution 4.0 License:
<https://creativecommons.org/licenses/by/4.0/>

Source: <https://download.geonames.org/export/dump/>

The derived artifact is a Bloom filter over case- and diacritic-folded place
names; it is a transformation of the source data and this attribution travels
with it. CC BY 4.0 is not copyleft, so this notice is the only obligation it
places on the project — the surrounding code remains MIT.

## Wikidata

The same file contains membership filters derived from Wikidata: given names
(Q202444), family names (Q101352), brands (Q431289) and businesses (Q4830453).

Wikidata's structured data is released under the Creative Commons CC0 1.0
Universal Public Domain Dedication:
<https://creativecommons.org/publicdomain/zero/1.0/>

CC0 imposes no attribution requirement. This notice is recorded for provenance
rather than obligation.
