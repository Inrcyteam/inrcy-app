import ContactContent from "../settings/_components/ContactContent";
import AccountContent from "../settings/_components/AccountContent";
import ProfilContent from "../settings/_components/ProfilContent";
import ActivityContent from "../settings/_components/ActivityContent";
import AbonnementContent from "../settings/_components/AbonnementContent";
import LegalContent from "../settings/_components/LegalContent";
import RgpdContent from "../settings/_components/RgpdContent";
import MailsSettingsContent from "../settings/_components/MailsSettingsContent";
import InertiaContent from "../settings/_components/InertiaContent";
import BoutiqueContent from "../settings/_components/BoutiqueContent";
import NotificationsSettingsContent from "../settings/_components/NotificationsSettingsContent";
import ReferralPanel from "./ReferralPanel";
import SiteInrcyPanelBlock from "./SiteInrcyPanelBlock";
import SiteWebPanelBlock from "./SiteWebPanelBlock";
import InstagramPanelBlock from "./InstagramPanelBlock";
import LinkedinPanelBlock from "./LinkedinPanelBlock";
import GmbPanelBlock from "./GmbPanelBlock";
import FacebookPanelBlock from "./FacebookPanelBlock";

type DashboardPanelName =
  | "contact"
  | "profil"
  | "compte"
  | "activite"
  | "abonnement"
  | "mails"
  | "site_inrcy"
  | "site_web"
  | "instagram"
  | "linkedin"
  | "gmb"
  | "facebook"
  | "legal"
  | "rgpd"
  | "inertie"
  | "boutique"
  | "notifications"
  | "parrainage";

type DashboardSettingsDrawerContentProps = {
  panel: string | null;
  checkProfile: () => void | Promise<void>;
  checkActivity: () => void | Promise<void>;
  inertiaSnapshot: any;
  openPanel: (name: DashboardPanelName) => void;
  referralName: string;
  referralPhone: string;
  referralEmail: string;
  referralFrom: string;
  referralSubmitting: boolean;
  referralNotice: string | null;
  referralError: string | null;
  onReferralNameChange: (value: string) => void;
  onReferralPhoneChange: (value: string) => void;
  onReferralEmailChange: (value: string) => void;
  onReferralFromChange: (value: string) => void;
  submitReferral: () => void | Promise<void>;
  siteInrcyPanelProps: any;
  siteWebPanelProps: any;
  instagramPanelProps: any;
  linkedinPanelProps: any;
  gmbPanelProps: any;
  facebookPanelProps: any;
};

export default function DashboardSettingsDrawerContent({
  panel,
  checkProfile,
  checkActivity,
  inertiaSnapshot,
  openPanel,
  referralName,
  referralPhone,
  referralEmail,
  referralFrom,
  referralSubmitting,
  referralNotice,
  referralError,
  onReferralNameChange,
  onReferralPhoneChange,
  onReferralEmailChange,
  onReferralFromChange,
  submitReferral,
  siteInrcyPanelProps,
  siteWebPanelProps,
  instagramPanelProps,
  linkedinPanelProps,
  gmbPanelProps,
  facebookPanelProps,
}: DashboardSettingsDrawerContentProps) {
  return (
    <>
      {panel === "contact" && <ContactContent mode="drawer" />}
      {panel === "compte" && <AccountContent mode="drawer" />}
      {panel === "profil" && <ProfilContent mode="drawer" onProfileSaved={checkProfile} onProfileReset={checkProfile} />}
      {panel === "activite" && <ActivityContent mode="drawer" onActivitySaved={checkActivity} onActivityReset={checkActivity} />}
      {panel === "abonnement" && <AbonnementContent mode="drawer" />}
      {panel === "legal" && <LegalContent mode="drawer" />}
      {panel === "rgpd" && <RgpdContent mode="drawer" />}
      {panel === "mails" && <MailsSettingsContent />}
      {panel === "inertie" && (
        <InertiaContent
          mode="drawer"
          snapshot={inertiaSnapshot}
          onOpenBoutique={() => openPanel("boutique")}
        />
      )}
      {panel === "boutique" && (
        <BoutiqueContent
          mode="drawer"
          onOpenInertia={() => openPanel("inertie")}
        />
      )}
      {panel === "parrainage" && (
        <ReferralPanel
          referralName={referralName}
          referralPhone={referralPhone}
          referralEmail={referralEmail}
          referralFrom={referralFrom}
          referralSubmitting={referralSubmitting}
          referralNotice={referralNotice}
          referralError={referralError}
          onReferralNameChange={onReferralNameChange}
          onReferralPhoneChange={onReferralPhoneChange}
          onReferralEmailChange={onReferralEmailChange}
          onReferralFromChange={onReferralFromChange}
          onSubmit={submitReferral}
        />
      )}
      {panel === "notifications" && <NotificationsSettingsContent />}

      <SiteInrcyPanelBlock panel={panel} panelProps={siteInrcyPanelProps} />
      <SiteWebPanelBlock panel={panel} panelProps={siteWebPanelProps} />
      <InstagramPanelBlock panel={panel} panelProps={instagramPanelProps} />
      <LinkedinPanelBlock panel={panel} panelProps={linkedinPanelProps} />
      <GmbPanelBlock panel={panel} panelProps={gmbPanelProps} />
      <FacebookPanelBlock panel={panel} panelProps={facebookPanelProps} />
    </>
  );
}
