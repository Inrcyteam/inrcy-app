import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureFrenchPublicationErrorMessage,
  getProviderPublicationErrorMessage,
  looksLikeEnglishErrorMessage,
} from "../../lib/publicationErrorFrench.ts";

test("L'erreur de ratios Pinterest est traduite en français", () => {
  const message = getProviderPublicationErrorMessage(
    "pinterest",
    "Pinterest Images must have the same width/height ratios.",
  );

  assert.equal(
    message,
    "Pinterest exige le même format pour toutes les images d’une épingle. iNrCy les harmonise automatiquement avant l’envoi.",
  );
});

test("L'échec de récupération de couverture Pinterest est traduit en français", () => {
  const message = getProviderPublicationErrorMessage(
    "pinterest",
    "Sorry we could not fetch the image.",
  );

  assert.equal(
    message,
    "Pinterest n’a pas pu récupérer une image. Vérifiez qu’elle reste publique et accessible, puis réessayez.",
  );
});

test("L'erreur d'URL photo TikTok est traduite et explique localhost", () => {
  const message = getProviderPublicationErrorMessage(
    "tiktok",
    "The provided photo URL properties have not been verified.",
  );

  assert.match(String(message), /domaine média iNrCy/);
  assert.match(String(message), /localhost/);
  assert.doesNotMatch(String(message), /provided|verified/i);
});

test("Une erreur anglaise inconnue ne traverse jamais l'interface", () => {
  const raw = "The request failed because an unsupported operation was provided.";
  assert.equal(looksLikeEnglishErrorMessage(raw), true);
  assert.equal(
    ensureFrenchPublicationErrorMessage(raw, "La publication n’a pas pu aboutir."),
    "La publication n’a pas pu aboutir.",
  );
});

test("Les messages courts des fournisseurs restent bloqués s'ils sont en anglais", () => {
  const raw = "Media is too large";
  assert.equal(looksLikeEnglishErrorMessage(raw), true);
  assert.equal(
    ensureFrenchPublicationErrorMessage(
      raw,
      "Le média dépasse la taille autorisée.",
    ),
    "Le média dépasse la taille autorisée.",
  );
});
