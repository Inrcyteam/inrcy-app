"use client";

import HelpModal from "./HelpModal";

type DashboardHelpModalsProps = {
  helpGeneratorOpen: boolean;
  helpCanauxOpen: boolean;
  helpSiteInrcyOpen: boolean;
  helpSiteWebOpen: boolean;
  helpInertieOpen: boolean;
  onCloseGenerator: () => void;
  onCloseCanaux: () => void;
  onCloseSiteInrcy: () => void;
  onCloseSiteWeb: () => void;
  onCloseInertie: () => void;
};

const INERTIA_ROWS = [
  { a: "Ouverture du compte", g: "+50 UI", f: "1 fois" },
  { a: "Compléter Mon profil", g: "+100 UI", f: "1 fois" },
  { a: "Compléter Mon activité", g: "+100 UI", f: "1 fois" },
  { a: "Créer une actu", g: "+10 UI", f: "1 fois / semaine" },
  { a: "Utiliser Booster / Fidéliser", g: "+10 UI", f: "1 fois / semaine" },
  { a: "Ancienneté", g: "+50 UI", f: "1re fois au 30e jour, puis tous les 30 jours" },
] as const;

export default function DashboardHelpModals({
  helpGeneratorOpen,
  helpCanauxOpen,
  helpSiteInrcyOpen,
  helpSiteWebOpen,
  helpInertieOpen,
  onCloseGenerator,
  onCloseCanaux,
  onCloseSiteInrcy,
  onCloseSiteWeb,
  onCloseInertie,
}: DashboardHelpModalsProps) {
  return (
    <>
      <HelpModal open={helpGeneratorOpen} title="Générateur iNrCy" onClose={onCloseGenerator}>
        <p style={{ marginTop: 0 }}>
          Le Générateur iNrCy est le moteur de votre activité. Il connecte vos canaux pour capter des prospects et générer des opportunités.
        </p>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Connectez vos canaux</li>
          <li>Activez des actions (Booster / Fidéliser)</li>
          <li>Suivez vos opportunités et vos contacts</li>
        </ol>
      </HelpModal>

      <HelpModal open={helpCanauxOpen} title="Canaux" onClose={onCloseCanaux}>
        <p style={{ marginTop: 0 }}>
          Connectez chaque canal pour créer une synergie entre tous vos outils de communication et capter davantage de prospects et de clients.
        </p>
        <p style={{ marginBottom: 0 }}>
          Pour connecter un canal : ouvrez le panneau <strong>Configurer</strong>, cliquez sur les boutons indiqués, puis suivez les étapes demandées.
        </p>
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
