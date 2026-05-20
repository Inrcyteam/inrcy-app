"use client";

import HelpModal from "./HelpModal";

type DashboardHelpModalsProps = {
  helpGeneratorOpen: boolean;
  helpCanauxOpen: boolean;
  helpSiteInrcyOpen: boolean;
  helpSiteWebOpen: boolean;
  helpInertieOpen: boolean;
  helpInstagramOpen: boolean;
  onCloseGenerator: () => void;
  onCloseCanaux: () => void;
  onCloseSiteInrcy: () => void;
  onCloseSiteWeb: () => void;
  onCloseInertie: () => void;
  onCloseInstagram: () => void;
};

const INERTIA_ROWS = [
  { a: "Ouverture du compte", g: "+50 UI", f: "1 fois" },
  { a: "Compléter Mon profil", g: "+100 UI", f: "1 fois" },
  { a: "Compléter Mon activité", g: "+100 UI", f: "1 fois" },
  { a: "Utiliser Booster", g: "+10 UI", f: "1 publication / semaine" },
  { a: "Utiliser Propulser", g: "+10 UI", f: "1 action / semaine" },
  { a: "Utiliser Fidéliser", g: "+10 UI", f: "1 action / semaine" },
  { a: "Ancienneté", g: "+50 UI", f: "1re fois au 30e jour, puis tous les 30 jours" },
] as const;

export default function DashboardHelpModals({
  helpGeneratorOpen,
  helpCanauxOpen,
  helpSiteInrcyOpen,
  helpSiteWebOpen,
  helpInertieOpen,
  helpInstagramOpen,
  onCloseGenerator,
  onCloseCanaux,
  onCloseSiteInrcy,
  onCloseSiteWeb,
  onCloseInertie,
  onCloseInstagram,
}: DashboardHelpModalsProps) {
  return (
    <>
      <HelpModal open={helpGeneratorOpen} title="Générateur iNrCy" onClose={onCloseGenerator}>
        <div
          style={{
            marginTop: 0,
            borderRadius: 18,
            padding: 24,
            background:
              "linear-gradient(135deg, rgba(0,180,255,0.14), rgba(167,72,255,0.14), rgba(255,92,138,0.10))",
            border: "1px solid rgba(110,180,255,0.18)",
            boxShadow: "0 0 40px rgba(87,117,255,0.12)",
          }}
        >
          <p style={{ marginTop: 0, fontSize: 15.5, lineHeight: 1.8 }}>
            Le Générateur iNrCy centralise vos canaux et vos outils de communication afin de développer votre visibilité, attirer de nouveaux contacts et stimuler votre activité.
          </p>

          <div style={{ display: "grid", gap: 22 }}>
            <div>
              <div style={{ fontWeight: 700, color: "#66d9ff", marginBottom: 10 }}>⚡ Unités d’Inertie</div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Points générés par votre activité et votre communication sur iNrCy (Booster, Propulser, Fidéliser, publications et actions hebdo). Plus votre générateur est actif, plus vous accumulez d’Unités d’Inertie utilisables dans la Boutique iNrCy.
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, color: "#ff9ad5", marginBottom: 10 }}>💰 CA potentiel 30 jours</div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Estimation du chiffre d’affaires pouvant être généré dans les 30 prochains jours selon votre activité, vos canaux et votre dynamique de communication.
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, color: "#7df7c4", marginBottom: 10 }}>📈 Demandes captées</div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Analyse business des statistiques réelles de vos canaux sur les 7 et 30 derniers jours.
                Appels, clics, itinéraires, visites engagées, formulaires ou prises de contact : iNrCy identifie les contacts sérieux générés grâce à la qualité de vos canaux et aux actions de communication réalisées.
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, color: "#ffd36f", marginBottom: 10 }}>🚀 Opportunités activables</div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Contacts supplémentaires pouvant être générés grâce aux actions recommandées dans iNrCy : publier avec Booster, développer avec Propulser ou entretenir la relation avec Fidéliser.
                Chaque opportunité activable représente une nouvelle demande potentielle à capter via vos canaux de communication.
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 18,
              padding: "12px 14px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 13,
              lineHeight: 1.5,
              opacity: 0.95,
            }}
          >
            Les données affichées sont calculées automatiquement à partir de l’activité détectée sur vos canaux et dans votre générateur iNrCy.
          </div>
        </div>
      </HelpModal>

      <HelpModal open={helpCanauxOpen} title="Canaux iNrCy" onClose={onCloseCanaux}>
        <div
          style={{
            marginTop: 0,
            borderRadius: 18,
            padding: 24,
            background:
              "linear-gradient(135deg, rgba(0,180,255,0.14), rgba(167,72,255,0.14), rgba(255,92,138,0.10))",
            border: "1px solid rgba(110,180,255,0.18)",
            boxShadow: "0 0 40px rgba(87,117,255,0.12)",
          }}
        >
          <p style={{ marginTop: 0, marginBottom: 28, fontSize: 15.5, lineHeight: 1.8 }}>
            Les canaux iNrCy représentent les différentes sources de visibilité connectées à votre générateur.
            Chaque canal alimente votre activité avec ses statistiques, ses interactions et ses performances.
          </p>

          <div style={{ display: "grid", gap: 24 }}>
            <div>
              <div style={{ fontWeight: 700, color: "#66d9ff", marginBottom: 10 }}>🌐 Site iNrCy</div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Votre machine à leads intelligente. Disponible uniquement avec un site créé par iNrCy. Les statistiques et publications Booster remontent automatiquement dans votre générateur.
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, color: "#ff9ad5", marginBottom: 10 }}>🖥️ Site web</div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Transforme vos visiteurs en contacts potentiels. Ajoutez l’URL de votre site, connectez Google Analytics / Search Console et intégrez l’iframe iNrCy pour analyser vos performances et afficher vos publications Booster.
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, color: "#7df7c4", marginBottom: 10 }}>📍 Google Business</div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Développe votre visibilité locale grâce aux appels, clics, itinéraires et interactions Google. Connectez votre fiche Google Business Profile pour centraliser automatiquement vos statistiques.
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, color: "#ffd36f", marginBottom: 10 }}>📘 Facebook</div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Diffuse votre activité et développe l’engagement autour de vos publications. Connectez votre page Facebook pour publier et analyser vos performances directement depuis iNrCy.
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, color: "#d6a4ff", marginBottom: 10 }}>📸 Instagram</div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Renforce votre image de marque grâce à vos contenus visuels et à l’engagement généré. Connectez votre compte Instagram professionnel pour diffuser vos publications depuis iNrCy.
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, color: "#89c6ff", marginBottom: 10 }}>💼 LinkedIn</div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Développe votre visibilité professionnelle et votre réseau business. Connectez votre page LinkedIn pour publier vos contenus professionnels directement depuis iNrCy.
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 22,
              padding: "14px 16px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 13,
              lineHeight: 1.6,
              opacity: 0.95,
            }}
          >
            Plus vos canaux sont actifs et alimentés par Booster, Propulser et Fidéliser, plus votre générateur augmente sa capacité à attirer et convertir de nouveaux contacts.
          </div>
        </div>
      </HelpModal>

      <HelpModal open={helpInstagramOpen} title="Connexion Instagram" onClose={onCloseInstagram}>
        <div
          style={{
            marginTop: 0,
            borderRadius: 18,
            padding: 24,
            background:
              "linear-gradient(135deg, rgba(0,180,255,0.14), rgba(167,72,255,0.14), rgba(255,92,138,0.10))",
            border: "1px solid rgba(110,180,255,0.18)",
            boxShadow: "0 0 40px rgba(87,117,255,0.12)",
          }}
        >
          <p style={{ marginTop: 0, marginBottom: 18, fontSize: 15.5, lineHeight: 1.75 }}>
            Vous ne parvenez pas à vous connecter ou vous ne trouvez pas votre compte Instagram ?
            Pour fonctionner avec iNrCy, votre compte Instagram <strong>Business / Creator</strong> doit être relié à une
            <strong> Page Facebook professionnelle</strong> accessible par votre profil Facebook ou votre portefeuille Meta Business.
          </p>

          <div style={{ display: "grid", gap: 16 }}>
            <div
              style={{
                borderRadius: 16,
                padding: 16,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
              }}
            >
              <div style={{ fontWeight: 800, color: "#66d9ff", marginBottom: 10 }}>📘 Solution 1 — Depuis Facebook</div>
              <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14.5 }}>
                <li>Ouvrez Facebook et passez sur votre <strong>Page professionnelle</strong>.</li>
                <li>Allez dans <strong>Paramètres et confidentialité</strong>, puis <strong>Paramètres</strong>.</li>
                <li>Dans les réglages de la Page, ouvrez <strong>Comptes liés</strong> ou <strong>Autorisations</strong>.</li>
                <li>Choisissez <strong>Instagram</strong>, puis cliquez sur <strong>Connecter un compte</strong>.</li>
                <li>Connectez le bon compte Instagram <strong>Business / Creator</strong> et validez la liaison.</li>
              </ol>
            </div>

            <div
              style={{
                borderRadius: 16,
                padding: 16,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
              }}
            >
              <div style={{ fontWeight: 800, color: "#ff9ad5", marginBottom: 10 }}>📸 Solution 2 — Depuis Instagram</div>
              <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14.5 }}>
                <li>Ouvrez Instagram avec le compte professionnel à connecter.</li>
                <li>Allez sur le profil, puis cliquez sur <strong>Modifier le profil</strong>.</li>
                <li>Dans <strong>Informations publiques de l’entreprise</strong>, ouvrez <strong>Page</strong>.</li>
                <li>Sélectionnez la bonne <strong>Page Facebook professionnelle</strong>.</li>
                <li>Si la Page n’apparaît pas, vérifiez que le profil Facebook utilisé possède bien les droits sur cette Page.</li>
              </ol>
            </div>
          </div>

          <div
            style={{
              marginTop: 18,
              padding: "13px 15px",
              borderRadius: 14,
              background: "rgba(34,197,94,0.10)",
              border: "1px solid rgba(34,197,94,0.20)",
              fontSize: 13.5,
              lineHeight: 1.6,
              opacity: 0.98,
            }}
          >
            Une fois la liaison faite, revenez dans iNrCy, ouvrez <strong>Configuration — Instagram</strong>, puis cliquez sur
            <strong> Charger mes comptes</strong>. Si vous utilisez un portefeuille Meta Business, essayez aussi la connexion
            <strong> Business / Meta</strong>.
          </div>
        </div>
      </HelpModal>

      <HelpModal open={helpSiteInrcyOpen} title="Site iNrCy" onClose={onCloseSiteInrcy}>
        <p style={{ marginTop: 0 }}>
          La bulle <strong>Site iNrCy</strong> est accessible uniquement si vous êtes détenteur d&apos;un site internet chez nous.
        </p>
        <p>
          Si c&apos;est le cas, nous nous occupons directement de la performance du site et vous pouvez activer et désactiver le suivi des résultats. Vos publications via l&apos;outil Booster remontent automatiquement sur le site en page d&apos;accueil.
        </p>
      </HelpModal>

      <HelpModal open={helpSiteWebOpen} title="Site web" onClose={onCloseSiteWeb}>
        <p style={{ marginTop: 0 }}>
          La bulle <strong>Site web</strong> correspond à votre site existant. Une fois relié, il devient un canal supplémentaire dans votre générateur iNrCy.
        </p>
        <p>
          Cette connexion permet de centraliser vos informations et de vérifier que votre site travaille bien avec vos autres outils.
        </p>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Ajoutez l&apos;URL de votre site web.</li>
          <li>Cliquez sur les boutons de connexion pour relier automatiquement Google Analytics et Search Console pour remonter les statistiques. Ces outils doivent évidemment être enregistrés sur votre compte Google.</li>
          <li>Ajouter le code du &quot;widget iNrCy&quot; fourni n&apos;importe où sur votre site internet pour que les publications de l&apos;outil Booster arrivent automatiquement dessus.</li>
        </ol>
      </HelpModal>

      <HelpModal open={helpInertieOpen} title="Mon inertie — Tableau des gains UI" onClose={onCloseInertie}>
        <p style={{ marginTop: 0 }}>
          Voici les actions qui rapportent des <strong>UI</strong> (Unités d’Inertie).
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Action</th>
                <th style={{ textAlign: "left", padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Gain</th>
                <th style={{ textAlign: "left", padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Fréquence</th>
              </tr>
            </thead>
            <tbody>
              {INERTIA_ROWS.map((row) => (
                <tr key={row.a}>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{row.a}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{row.g}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{row.f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginBottom: 0, marginTop: 12, opacity: 0.9 }}>
          Le Turbo UI multiplie certaines actions selon vos canaux connectés. Tout est visible dans l’Historique de Mon inertie.
        </p>
      </HelpModal>
    </>
  );
}
