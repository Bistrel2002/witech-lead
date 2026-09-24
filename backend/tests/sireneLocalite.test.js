import test from 'node:test';
import assert from 'node:assert/strict';
import { inDepartement } from '../src/services/sireneService.js';

/**
 * Le filtre `departement` de l'API porte sur les etablissements, pas sur le
 * siege. Sans ces regles, un prospect d'Annecy arrive etiquete « Lyon » : le
 * mail parle de la mauvaise ville, et la verification de domaine de
 * l'enrichissement cherche la mauvaise commune sur le site.
 *
 * Mesure du 2026-09-24 sur 380 entreprises : 0 % d'ecart sur le decolletage
 * du 74, 29 % sur les experts-comptables du meme departement.
 */

test('metropole : le prefixe a deux chiffres decide', () => {
  assert.equal(inDepartement('74000', '74'), true);   // Annecy
  assert.equal(inDepartement('74460', '74'), true);   // Marnaz
  assert.equal(inDepartement('69003', '74'), false);  // Lyon
  assert.equal(inDepartement('38700', '74'), false);  // La Tronche
});

test('departement a un chiffre : 1 vaut 01', () => {
  // L'interface laisse taper « 1 » pour l'Ain ; sans le padStart, aucun code
  // postal ne correspondrait et tous les prospects tomberaient sur le siege.
  assert.equal(inDepartement('01100', '1'), true);    // Oyonnax
  assert.equal(inDepartement('01100', '01'), true);
  assert.equal(inDepartement('10100', '01'), false);  // Aube, pas Ain
});

test('outre-mer : trois chiffres, pas deux', () => {
  // '974' tronque a '97' accepterait la Martinique comme La Reunion.
  assert.equal(inDepartement('97400', '974'), true);
  assert.equal(inDepartement('97200', '974'), false); // Fort-de-France
  assert.equal(inDepartement('97200', '972'), true);
});

test('Corse : 2A et 2B partagent le prefixe postal 20', () => {
  // Le code postal ne distingue pas les deux departements corses. On accepte
  // les deux : l'etablissement local reste meilleur que le siege, et rejeter
  // la Corse entiere serait pire.
  assert.equal(inDepartement('20000', '2A'), true);
  assert.equal(inDepartement('20200', '2B'), true);
  assert.equal(inDepartement('20000', '2a'), true);   // casse indifferente
  assert.equal(inDepartement('13000', '2A'), false);
});

test('entrees vides ne matchent jamais', () => {
  assert.equal(inDepartement('', '74'), false);
  assert.equal(inDepartement('74000', ''), false);
  assert.equal(inDepartement(null, null), false);
  assert.equal(inDepartement(undefined, '74'), false);
});
