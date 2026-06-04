"use client";

import HelpModal from "./HelpModal";

type DashboardHelpModalsProps = {
  helpGeneratorOpen: boolean;
  helpCanauxOpen: boolean;
  helpSiteInrcyOpen: boolean;
  helpSiteWebOpen: boolean;
  helpInertieOpen: boolean;
  helpInstagramOpen: boolean;
  helpFacebookOpen: boolean;
  onCloseGenerator: () => void;
  onCloseCanaux: () => void;
  onCloseSiteInrcy: () => void;
  onCloseSiteWeb: () => void;
  onCloseInertie: () => void;
  onCloseFacebook: () => void;
  onCloseInstagram: () => void;
};

const INERTIA_ROWS = [
  { a: "Ouverture du compte", g: "+50 UI", f: "1 fois" },
  { a: "Compléter Mon profil", g: "+100 UI", f: "1 fois" },
  { a: "Compléter Mon activité", g: "+100 UI", f: "1 fois" },
  { a: "Utiliser Booster", g: "+10 UI", f: "1 publication / semaine" },
  { a: "Utiliser Propulser", g: "+10 UI", f: "1 action / semaine" },
  { a: "Utiliser Fidéliser", g: "+10 UI", f: "1 action / semaine" },
  {
    a: "Ancienneté",
    g: "+50 UI",
    f: "1re fois au 30e jour, puis tous les 30 jours",
  },
] as const;

export default function DashboardHelpModals({
  helpGeneratorOpen,
  helpCanauxOpen,
  helpSiteInrcyOpen,
  helpSiteWebOpen,
  helpInertieOpen,
  helpInstagramOpen,
  helpFacebookOpen,
  onCloseGenerator,
  onCloseCanaux,
  onCloseSiteInrcy,
  onCloseSiteWeb,
  onCloseInertie,
  onCloseFacebook,
  onCloseInstagram,
}: DashboardHelpModalsProps) {
  return (
    <>
      <HelpModal
        open={helpGeneratorOpen}
        title="Générateur iNrCy"
        onClose={onCloseGenerator}
      >
        <div
          style={{
            marginTop: 0,
            borderRadius: 18,
            padding: "clamp(16px, 4vw, 24px)",
            boxSizing: "border-box",
            maxWidth: "100%",
            overflow: "hidden",
            background:
              "linear-gradient(135deg, rgba(0,180,255,0.14), rgba(167,72,255,0.14), rgba(255,92,138,0.10))",
            border: "1px solid rgba(110,180,255,0.18)",
            boxShadow: "0 0 40px rgba(87,117,255,0.12)",
          }}
        >
          <p style={{ marginTop: 0, fontSize: 15.5, lineHeight: 1.8 }}>
            Le Générateur iNrCy centralise vos canaux et vos outils de
            communication afin de développer votre visibilité, attirer de
            nouveaux contacts et stimuler votre activité.
          </p>

          <div style={{ display: "grid", gap: 22 }}>
            <div>
              <div
                style={{ fontWeight: 700, color: "#66d9ff", marginBottom: 10 }}
              >
                ⚡ Unités d’Inertie
              </div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Points générés par votre activité et votre communication sur
                iNrCy (Booster, Propulser, Fidéliser, publications et actions
                hebdo). Plus votre générateur est actif, plus vous accumulez
                d’Unités d’Inertie utilisables dans la Boutique iNrCy.
              </div>
            </div>

            <div>
              <div
                style={{ fontWeight: 700, color: "#ff9ad5", marginBottom: 10 }}
              >
                💰 CA potentiel 30 jours
              </div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Estimation du chiffre d’affaires pouvant être généré dans les 30
                prochains jours selon votre activité, vos canaux et votre
                dynamique de communication.
              </div>
            </div>

            <div>
              <div
                style={{ fontWeight: 700, color: "#7df7c4", marginBottom: 10 }}
              >
                📈 Demandes captées
              </div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Analyse business des statistiques réelles de vos canaux sur les
                7 et 30 derniers jours. Appels, clics, itinéraires, visites
                engagées, formulaires ou prises de contact : iNrCy identifie les
                contacts sérieux générés grâce à la qualité de vos canaux et aux
                actions de communication réalisées.
              </div>
            </div>

            <div>
              <div
                style={{ fontWeight: 700, color: "#ffd36f", marginBottom: 10 }}
              >
                🚀 Opportunités activables
              </div>
              <div style={{ opacity: 0.96, lineHeight: 1.75, fontSize: 14.5 }}>
                Contacts supplémentaires pouvant être générés grâce aux actions
                recommandées dans iNrCy : publier avec Booster, développer avec
                Propulser ou entretenir la relation avec Fidéliser. Chaque
                opportunité activable représente une nouvelle demande
                potentielle à capter via vos canaux de communication.
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
            Les données affichées sont calculées automatiquement à partir de
            l’activité détectée sur vos canaux et dans votre générateur iNrCy.
          </div>
        </div>
      </HelpModal>

      <HelpModal
        open={helpCanauxOpen}
        title="Canaux iNrCy"
        onClose={onCloseCanaux}
      >
        <div
          style={{
            marginTop: 0,
            borderRadius: 18,
            padding: "clamp(16px, 4vw, 24px)",
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
            overflow: "hidden",
            background:
              "linear-gradient(135deg, rgba(0,180,255,0.14), rgba(167,72,255,0.14), rgba(255,92,138,0.10))",
            border: "1px solid rgba(110,180,255,0.18)",
            boxShadow: "0 0 40px rgba(87,117,255,0.12)",
          }}
        >
          <p
            style={{
              marginTop: 0,
              marginBottom: 18,
              fontSize: 15.5,
              lineHeight: 1.8,
              overflowWrap: "anywhere",
            }}
          >
            Les canaux iNrCy représentent les différentes sources connectées à
            votre générateur. Ils n’ont pas tous le même rôle : certains
            diffusent votre communication, d’autres captent des contacts ou
            préparent des actions à valider.
          </p>

          <div style={{ display: "grid", gap: 20, maxWidth: "100%", minWidth: 0 }}>
            <section
              style={{
                borderRadius: 16,
                padding: 16,
                maxWidth: "100%",
                boxSizing: "border-box",
                overflow: "hidden",
                background: "rgba(255,255,255,0.045)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{ fontWeight: 800, color: "#66d9ff", marginBottom: 6 }}
              >
                📡 Canaux de diffusion
              </div>
              <p
                style={{
                  margin: "0 0 14px",
                  opacity: 0.92,
                  lineHeight: 1.65,
                  fontSize: 14,
                }}
              >
                Ils publient, diffusent ou analysent votre visibilité sur vos
                supports publics et vos audiences.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
                  gap: 14,
                }}
              >
                {[
                  {
                    icon: "🌐",
                    name: "Site iNrCy",
                    color: "#66d9ff",
                    text: "Votre machine à leads intelligente. Disponible avec un site créé par iNrCy, il remonte automatiquement les statistiques et publications Booster dans votre générateur.",
                  },
                  {
                    icon: "🖥️",
                    name: "Site web",
                    color: "#ff9ad5",
                    text: "Relie votre site actuel à iNrCy. Ajoutez l’URL, connectez Analytics / Search Console et intégrez l’iframe pour analyser les performances et afficher vos publications.",
                  },
                  {
                    icon: "📍",
                    name: "Google Business",
                    color: "#7df7c4",
                    text: "Développe votre visibilité locale avec les appels, clics, itinéraires, interactions et avis. La fiche Google alimente automatiquement vos statistiques.",
                  },
                  {
                    icon: "📘",
                    name: "Facebook",
                    color: "#ffd36f",
                    text: "Diffuse votre activité, développe l’engagement et permet de publier puis analyser vos performances depuis iNrCy.",
                  },
                  {
                    icon: "📸",
                    name: "Instagram",
                    color: "#d6a4ff",
                    text: "Renforce votre image de marque avec vos contenus visuels et l’engagement généré par vos publications.",
                  },
                  {
                    icon: "💼",
                    name: "LinkedIn",
                    color: "#89c6ff",
                    text: "Développe votre visibilité professionnelle et votre réseau business avec des contenus adaptés à votre activité.",
                  },
                  {
                    icon: "🎵",
                    name: "TikTok",
                    color: "#ff8bbd",
                    text: "Prépare la diffusion de contenus courts et vidéos pour renforcer votre visibilité quand le canal est activé.",
                  },
                  {
                    icon: "✉️",
                    name: "Mails",
                    color: "#9ee7ff",
                    text: "Diffuse vos campagnes, fidélisations et communications CRM depuis les boîtes mail connectées.",
                  },
                ].map((channel) => (
                  <div key={channel.name} style={{ minWidth: 0, boxSizing: "border-box" }}>
                    <div
                      style={{
                        fontWeight: 800,
                        color: channel.color,
                        marginBottom: 6,
                      }}
                    >
                      {channel.icon} {channel.name}
                    </div>
                    <div
                      style={{ opacity: 0.96, lineHeight: 1.62, fontSize: 14 }}
                    >
                      {channel.text}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
                gap: 16,
              }}
            >
              <section
                style={{
                  borderRadius: 16,
                  padding: 16,
                  minWidth: 0,
                  boxSizing: "border-box",
                  background: "rgba(76,255,168,0.07)",
                  border: "1px solid rgba(125,247,196,0.14)",
                }}
              >
                <div
                  style={{ fontWeight: 800, color: "#b7ff8a", marginBottom: 6 }}
                >
                  🪪 Canal d’entrée — iNr'Badge
                </div>
                <div style={{ opacity: 0.96, lineHeight: 1.62, fontSize: 14 }}>
                  Votre carte de visite digitale en QR Code. Elle capte les
                  contacts, demandes et rendez-vous puis alimente les outils
                  liés comme iNr'Calendar et le CRM.
                </div>
              </section>

              <section
                style={{
                  borderRadius: 16,
                  padding: 16,
                  minWidth: 0,
                  boxSizing: "border-box",
                  background: "rgba(167,72,255,0.08)",
                  border: "1px solid rgba(199,164,255,0.16)",
                }}
              >
                <div
                  style={{ fontWeight: 800, color: "#c7a4ff", marginBottom: 6 }}
                >
                  🤖 Canal d’action — iNr'Agent
                </div>
                <div style={{ opacity: 0.96, lineHeight: 1.62, fontSize: 14 }}>
                  Prépare des publications, campagnes ou actions à valider. Il
                  ne remplace pas les autres canaux : il les pilote pour aider
                  le pro à agir régulièrement.
                </div>
              </section>
            </div>
          </div>

          <div
            style={{
              marginTop: 22,
              padding: "14px 16px",
              maxWidth: "100%",
              boxSizing: "border-box",
              borderRadius: 14,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 13,
              lineHeight: 1.6,
              opacity: 0.95,
            }}
          >
            Plus vos canaux sont actifs, connectés et alimentés par Booster,
            Propulser, Fidéliser ou iNr'Agent, plus le générateur augmente sa
            capacité à attirer, analyser et convertir de nouveaux contacts.
          </div>
        </div>
      </HelpModal>

      <HelpModal
        open={helpFacebookOpen}
        title="Connexion Facebook"
        onClose={onCloseFacebook}
      >
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
          <p
            style={{
              marginTop: 0,
              marginBottom: 18,
              fontSize: 15.5,
              lineHeight: 1.75,
            }}
          >
            Pour connecter Facebook à iNrCy, utilisez le{" "}
            <strong>compte Facebook personnel</strong> qui possède les droits
            sur votre <strong>Page Facebook professionnelle</strong>. iNrCy ne
            publie pas sur votre profil personnel : ce compte sert uniquement à
            accéder à la Page de votre entreprise.
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
              <div
                style={{ fontWeight: 800, color: "#66d9ff", marginBottom: 10 }}
              >
                ✅ Configuration correcte
              </div>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  lineHeight: 1.7,
                  fontSize: 14.5,
                }}
              >
                <li>
                  Vous avez un <strong>compte Facebook personnel</strong>.
                </li>
                <li>
                  Ce compte gère une{" "}
                  <strong>Page Facebook professionnelle</strong>.
                </li>
                <li>Vous connectez ce compte Facebook à iNrCy.</li>
                <li>
                  Vous sélectionnez ensuite la bonne{" "}
                  <strong>Page professionnelle</strong>.
                </li>
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
              <div
                style={{ fontWeight: 800, color: "#ff9ad5", marginBottom: 10 }}
              >
                📘 Créer une Page professionnelle
              </div>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  lineHeight: 1.7,
                  fontSize: 14.5,
                }}
              >
                <li>
                  Ouvrez Facebook avec votre <strong>compte personnel</strong>.
                </li>
                <li>
                  Allez dans <strong>Pages</strong>.
                </li>
                <li>
                  Cliquez sur <strong>Créer une Page</strong>.
                </li>
                <li>
                  Ajoutez le nom de l’entreprise, la catégorie et les
                  informations.
                </li>
                <li>
                  Vérifiez qu’il s’agit bien d’une <strong>Page</strong>, pas
                  d’un profil personnel.
                </li>
              </ol>
            </div>
          </div>

          <div
            style={{
              marginTop: 18,
              padding: "13px 15px",
              borderRadius: 14,
              background: "rgba(245,158,11,0.10)",
              border: "1px solid rgba(245,158,11,0.20)",
              fontSize: 13.5,
              lineHeight: 1.6,
              opacity: 0.98,
            }}
          >
            Attention : si votre “page entreprise” a des amis au lieu d’abonnés
            ou de mentions J’aime, il s’agit probablement d’un profil personnel
            mal configuré. Dans ce cas, iNrCy ne pourra pas l’utiliser comme
            Page professionnelle.
          </div>
        </div>
      </HelpModal>

      <HelpModal
        open={helpInstagramOpen}
        title="Connexion Instagram"
        onClose={onCloseInstagram}
      >
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
          <p
            style={{
              marginTop: 0,
              marginBottom: 18,
              fontSize: 15.5,
              lineHeight: 1.75,
            }}
          >
            Pour connecter Instagram à iNrCy, votre compte Instagram doit être{" "}
            <strong>professionnel</strong> : Business ou Creator. Il doit
            ensuite être relié à une{" "}
            <strong>Page Facebook professionnelle</strong> accessible par votre
            compte Facebook ou votre portefeuille Meta Business.
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
              <div
                style={{ fontWeight: 800, color: "#66d9ff", marginBottom: 10 }}
              >
                📸 Passer Instagram en compte professionnel
              </div>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  lineHeight: 1.7,
                  fontSize: 14.5,
                }}
              >
                <li>
                  Ouvrez Instagram, puis allez sur votre <strong>profil</strong>
                  .
                </li>
                <li>
                  Ouvrez le menu <strong>☰</strong>, puis{" "}
                  <strong>Paramètres et activité</strong>.
                </li>
                <li>
                  Cherchez <strong>Type de compte et outils</strong> ou{" "}
                  <strong>Outils professionnels</strong>.
                </li>
                <li>
                  Cliquez sur <strong>Passer à un compte professionnel</strong>.
                </li>
                <li>
                  Choisissez <strong>Business</strong> ou{" "}
                  <strong>Creator</strong>.
                </li>
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
              <div
                style={{ fontWeight: 800, color: "#ff9ad5", marginBottom: 10 }}
              >
                🔗 Relier Instagram à Facebook
              </div>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  lineHeight: 1.7,
                  fontSize: 14.5,
                }}
              >
                <li>
                  <strong>Depuis Instagram</strong> : Profil → Modifier le
                  profil → Page → sélectionnez la bonne Page Facebook
                  professionnelle.
                </li>
                <li>
                  <strong>Depuis Facebook</strong> : ouvrez la Page
                  professionnelle → Paramètres → Comptes liés ou Instagram →
                  connectez le compte Instagram professionnel.
                </li>
                <li>
                  Si la Page n’apparaît pas, vérifiez que le compte Facebook
                  utilisé possède bien les droits sur cette Page.
                </li>
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
              <div
                style={{ fontWeight: 800, color: "#7df7c4", marginBottom: 10 }}
              >
                🏢 Cas Meta Business
              </div>
              <div style={{ lineHeight: 1.7, fontSize: 14.5 }}>
                Si vous utilisez Meta Business Suite, vérifiez que la{" "}
                <strong>Page Facebook</strong> et le{" "}
                <strong>compte Instagram</strong> sont dans le même portefeuille
                Business, et que votre compte Facebook personnel a les droits
                sur les deux.
              </div>
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
            Si le compte Instagram ou la Page Facebook n’apparaît pas dans
            iNrCy, le problème vient presque toujours d’un compte personnel,
            d’une Page mal créée ou de droits Meta insuffisants.
          </div>
        </div>
      </HelpModal>

      <HelpModal
        open={helpSiteInrcyOpen}
        title="Site iNrCy"
        onClose={onCloseSiteInrcy}
      >
        <p style={{ marginTop: 0 }}>
          La bulle <strong>Site iNrCy</strong> est accessible uniquement si vous
          êtes détenteur d&apos;un site internet chez nous.
        </p>
        <p>
          Si c&apos;est le cas, nous nous occupons directement de la performance
          du site et vous pouvez activer et désactiver le suivi des résultats.
          Vos publications via l&apos;outil Booster remontent automatiquement
          sur le site en page d&apos;accueil.
        </p>
      </HelpModal>

      <HelpModal
        open={helpSiteWebOpen}
        title="Site web"
        onClose={onCloseSiteWeb}
      >
        <p style={{ marginTop: 0 }}>
          La bulle <strong>Site web</strong> correspond à votre site existant.
          Une fois relié, il devient un canal supplémentaire dans votre
          générateur iNrCy.
        </p>
        <p>
          Cette connexion permet de centraliser vos informations et de vérifier
          que votre site travaille bien avec vos autres outils.
        </p>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Ajoutez l&apos;URL de votre site web.</li>
          <li>
            Cliquez sur les boutons de connexion pour relier automatiquement
            Google Analytics et Search Console pour remonter les statistiques.
            Ces outils doivent évidemment être enregistrés sur votre compte
            Google.
          </li>
          <li>
            Ajouter le code du &quot;widget iNrCy&quot; fourni n&apos;importe où
            sur votre site internet pour que les publications de l&apos;outil
            Booster arrivent automatiquement dessus.
          </li>
        </ol>
      </HelpModal>

      <HelpModal
        open={helpInertieOpen}
        title="Mon inertie — Tableau des gains UI"
        onClose={onCloseInertie}
      >
        <p style={{ marginTop: 0 }}>
          Voici les actions qui rapportent des <strong>UI</strong> (Unités
          d’Inertie).
        </p>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "10px 10px",
                    borderBottom: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  Action
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "10px 10px",
                    borderBottom: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  Gain
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "10px 10px",
                    borderBottom: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  Fréquence
                </th>
              </tr>
            </thead>
            <tbody>
              {INERTIA_ROWS.map((row) => (
                <tr key={row.a}>
                  <td
                    style={{
                      padding: "10px 10px",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {row.a}
                  </td>
                  <td
                    style={{
                      padding: "10px 10px",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {row.g}
                  </td>
                  <td
                    style={{
                      padding: "10px 10px",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {row.f}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginBottom: 0, marginTop: 12, opacity: 0.9 }}>
          Le Turbo UI multiplie certaines actions selon vos canaux connectés.
          Tout est visible dans l’Historique de Mon inertie.
        </p>
      </HelpModal>
    </>
  );
}
