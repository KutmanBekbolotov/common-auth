import { ScopeOptionType } from '@prisma/client';

export const DEFAULT_ORG_IDS = [
  'Bishkek',
  'Chuy',
  'Talas',
  'Naryn',
  'Issyk-Kul',
  'Manas',
  'Osh',
  'Batken',
] as const;

export const DEFAULT_DEPARTMENT_IDS = [
  'Osh-City',
  'Kemin',
  'NarynReg',
  'Sokuluk',
  'Yssyk-Ata',
  'Toktogul',
  'Sulukta',
  'Bazarkorgon',
  'Nooken',
  'Aksy',
  'Tash-Komur',
  'Ala-Buka',
  'Karakul',
  'Karasuu',
  'Nookat',
  'Alay',
  'Kochkor',
  'Zhumgal',
  'Kadamzhay',
  'Talas',
  'Uzgen',
  'Ton',
  'Cholpon-Ata',
  'Balykchy',
  'Kyzyl-Kia',
  'Batken',
  'Zhalal-Abad',
  'Karakol',
  'Kara-Balta',
  'Oshreg',
  'Alamudun',
  'Tash-Dobo',
  'Vostok',
  'Kara-Buura',
] as const;

export const DEFAULT_SCOPE_OPTIONS = [
  ...DEFAULT_ORG_IDS.map((value) => ({
    type: ScopeOptionType.orgId,
    value,
  })),
  ...DEFAULT_DEPARTMENT_IDS.map((value) => ({
    type: ScopeOptionType.departmentId,
    value,
  })),
];
