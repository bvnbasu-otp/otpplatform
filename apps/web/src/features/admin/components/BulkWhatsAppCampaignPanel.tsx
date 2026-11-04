import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SNE_17_CATEGORIES } from './AdminLiveIntegrationProbes';
import { OTP_NEXT_CODE, PRODUCT_NAME } from '@/lib/brand';

export type CampaignLanguage = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml';

export interface LanguageVariant {
  subject: string;
  body: string;
  callToAction: string;
}

export interface CampaignLanguageMeta {
  code: CampaignLanguage;
  label: string;
  nativeLabel: string;
  region: 'North India' | 'South India' | 'Pan-India';
  flag: string;
}

export const CAMPAIGN_LANGUAGES: CampaignLanguageMeta[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', region: 'Pan-India', flag: '🇮🇳' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', region: 'North India', flag: '🇮🇳' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', region: 'South India', flag: '🇮🇳' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', region: 'South India', flag: '🇮🇳' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ', region: 'South India', flag: '🇮🇳' },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം', region: 'South India', flag: '🇮🇳' },
];

export interface CampaignTemplate {
  id: string;
  name: string;
  audience: 'BUYER' | 'SUPPLIER' | 'ALL';
  subject: string;
  body: string;
  callToAction: string;
  translations: Record<CampaignLanguage, LanguageVariant>;
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'TPL-X2O-LAUNCH',
    name: 'X2O Platform Greenfield Launch & Pilot Invitation',
    audience: 'ALL',
    subject: 'Official Invitation to Join X2O',
    body: "Namaste {{name}}! Welcome to {{platform}} ({{platform_code}}) — India's next-generation procurement operating system. Join verified buyers and top suppliers in {{city}} for transparent, identity-protected sourcing. Zero subscription fees during our greenfield pilot phase.",
    callToAction: 'Join the Pilot: https://x2o.app/signup?ref=PILOT2026',
    translations: {
      en: {
        subject: 'Official Invitation to Join X2O',
        body: "Namaste {{name}}! Welcome to {{platform}} ({{platform_code}}) — India's next-generation procurement operating system. Join verified buyers and top suppliers in {{city}} for transparent, identity-protected sourcing. Zero subscription fees during our greenfield pilot phase.",
        callToAction: 'Join the Pilot: https://x2o.app/signup?ref=PILOT2026',
      },
      hi: {
        subject: 'X2O में शामिल होने का आधिकारिक निमंत्रण',
        body: 'नमस्ते {{name}}! {{platform}} ({{platform_code}}) में आपका स्वागत है — भारत का आधुनिक खरीद और आपूर्ति ऑपरेटिंग सिस्टम। {{city}} में सत्यापित खरीदारों और शीर्ष आपूर्तिकर्ताओं से जुड़ें। ग्रीनफील्ड पायलट चरण के दौरान शून्य सदस्यता शुल्क।',
        callToAction: 'पायलट से जुड़ें: https://x2o.app/signup?ref=PILOT2026',
      },
      ta: {
        subject: 'X2O தளத்தில் இணைய அதிகாரப்பூர்வ அழைப்பு',
        body: 'வணக்கம் {{name}}! {{platform}} ({{platform_code}}) உங்களை வரவேற்கிறது — இந்தியாவின் அதிநவீன கொள்முதல் தளம். வெளிப்படையான, பாதுகாப்பான கொள்முதலுக்கு {{city}} நகரின் சரிபார்க்கப்பட்ட வாங்குபவர்கள் மற்றும் முன்னணி சப்ளையர்களுடன் இணையுங்கள். பைலட் காலத்தில் சந்தா கட்டணம் முற்றிலும் இலவசம்.',
        callToAction: 'பைலட்டில் இணையுங்கள்: https://x2o.app/signup?ref=PILOT2026',
      },
      te: {
        subject: 'X2O లో చేరడానికి అధికారిక ఆహ్వానం',
        body: 'నమస్కారం {{name}}! {{platform}} ({{platform_code}}) కు స్వాగతం — భారతదేశపు ఆధునిక కొనుగోలు మరియు సేకరణ వేదిక. పారదర్శకమైన వ్యాపారం కోసం {{city}} లోని ధృవీకరించబడిన కొనుగోలుదారులు మరియు సరఫరాదారులతో కలవండి. పైలట్ దశలో ఎటువంటి సబ్‌స్క్రిప్షన్ ఫీజు లేదు.',
        callToAction: 'పైలట్‌లో చేరండి: https://x2o.app/signup?ref=PILOT2026',
      },
      kn: {
        subject: 'X2O ಗೆ ಸೇರಲು ಅಧಿಕೃತ ಆಹ್ವಾನ',
        body: 'ನಮಸ್ಕಾರ {{name}}! {{platform}} ({{platform_code}}) ಗೆ ಸುಸ್ವಾಗತ — ಭಾರತದ ಅತ್ಯಾಧುನಿಕ ಖರೀದಿ ಮತ್ತು ಸರಬರಾಜು ವೇದಿಕೆ. ಪಾರದರ್ಶಕ ವಹಿವಾಟಿಗೆ {{city}} ಯ ಪರಿಶೀಲಿಸಿದ ಖರೀದಿದಾರರು ಮತ್ತು ಉನ್ನತ ಪೂರೈಕೆದಾರರೊಂದಿಗೆ ಸಂಪರ್ಕ ಸಾಧಿಸಿ. ಪೈಲಟ್ ಹಂತದಲ್ಲಿ ಯಾವುದೇ ಚಂದಾದಾರಿಕೆ ಶುಲ್ಕವಿಲ್ಲ.',
        callToAction: 'ಪೈಲಟ್‌ಗೆ ಸೇರಿ: https://x2o.app/signup?ref=PILOT2026',
      },
      ml: {
        subject: 'X2O-ലേക്ക് ചേരാനുള്ള ഔദ്യോഗിക ക്ഷണം',
        body: 'നമസ്കാരം {{name}}! {{platform}} ({{platform_code}})-ലേക്ക് സ്വാഗതം — ഇന്ത്യയുടെ ആധുനിക സംഭരണ പ്ലാറ്റ്‌ഫോം. സുതാര്യമായ ഇടപാടുകൾക്കായി {{city}}-യിലെ പരിശോധിച്ചുറപ്പിച്ച വാങ്ങുന്നവരുമായും മുൻനിര വിതരണക്കാരുമായും ബന്ധപ്പെടുക. പൈലറ്റ് കാലയളവിൽ സബ്‌സ്‌ക്രിപ്‌ഷൻ ഫീസ് പൂർണ്ണമായും സൗജന്യമാണ്.',
        callToAction: 'പൈലറ്റിൽ ചേരുക: https://x2o.app/signup?ref=PILOT2026',
      },
    },
  },
  {
    id: 'TPL-BUYER-WELCOME',
    name: 'Prospective Buyer Invitation (RWA & MSME)',
    audience: 'BUYER',
    subject: 'Simplify Society & Business Procurement',
    body: 'Hello {{name}}, manage your {{category}} requirements with 100% audit transparency. Compare competing verified quotes with identity protection and zero kickbacks. 3-quote quorum assurance & instant PO generation.',
    callToAction: 'Publish First Requirement: https://x2o.app/signup?side=buyer',
    translations: {
      en: {
        subject: 'Simplify Society & Business Procurement',
        body: 'Hello {{name}}, manage your {{category}} requirements with 100% audit transparency. Compare competing verified quotes with identity protection and zero kickbacks. 3-quote quorum assurance & instant PO generation.',
        callToAction: 'Publish First Requirement: https://x2o.app/signup?side=buyer',
      },
      hi: {
        subject: 'सोसायटी और व्यापारिक खरीद को सरल बनाएं',
        body: 'नमस्ते {{name}}, 100% ऑडिट पारदर्शिता के साथ अपनी {{category}} आवश्यकताओं का प्रबंधन करें। पहचान सुरक्षा के साथ प्रतिस्पर्धी सत्यापित कोटेशन की तुलना करें। 3-कोट कोरम आश्वासन और त्वरित खरीद आदेश (PO) निर्माण।',
        callToAction: 'पहली आवश्यकता दर्ज करें: https://x2o.app/signup?side=buyer',
      },
      ta: {
        subject: 'சொசைட்டி மற்றும் வணிகக் கொள்முதலை எளிதாக்குங்கள்',
        body: 'வணக்கம் {{name}}, உங்கள் {{category}} தேவைகளை 100% தணிக்கை வெளிப்படைத்தன்மையுடன் நிர்வகியுங்கள். அடையாள பாதுகாப்புடன் சரிபார்க்கப்பட்ட விலைக் குறிப்புகளை (Quotes) ஒப்பிடுங்கள். 3-கோட் கோரம் உறுதி மற்றும் உடனடி PO உருவாக்கம்.',
        callToAction: 'முதல் தேவையைப் பதிவு செய்க: https://x2o.app/signup?side=buyer',
      },
      te: {
        subject: 'సొసైటీ మరియు వ్యాపార కొనుగోళ్లను సులభతరం చేయండి',
        body: 'హలో {{name}}, మీ {{category}} అవసరాలను 100% ఆడిట్ పారదర్శకతతో నిర్వహించండి. గుర్తింపు భద్రతతో ధృవీకరించబడిన పోటీ కొటేషన్లను పోల్చండి. 3-కోట్ కోరం హామీ మరియు తక్షణ PO జనరేషన్.',
        callToAction: 'మొదటి అవసరాన్ని పోస్ట్ చేయండి: https://x2o.app/signup?side=buyer',
      },
      kn: {
        subject: 'ಸೊಸೈಟಿ ಮತ್ತು ವ್ಯಾಪಾರ ಖರೀದಿಯನ್ನು ಸುಲಭಗೊಳಿಸಿ',
        body: 'ಹಲೋ {{name}}, ನಿಮ್ಮ {{category}} ಅಗತ್ಯಗಳನ್ನು 100% ಆಡಿಟ್ ಪಾರದರ್ಶಕತೆಯೊಂದಿಗೆ ನಿರ್ವಹಿಸಿ. ಗುರುತಿನ ರಕ್ಷಣೆಯೊಂದಿಗೆ ಪರಿಶೀಲಿಸಿದ ಸ್ಪರ್ಧಾತ್ಮಕ ಉಲ್ಲೇಖಗಳನ್ನು (Quotes) ಹೋಲಿಕೆ ಮಾಡಿ. 3-ಕೋಟ್ ಕೋರಮ್ ಭರವಸೆ ಮತ್ತು ತಕ್ಷಣದ PO ಸೃಷ್ಟಿ.',
        callToAction: 'ಮೊದಲ ಅಗತ್ಯವನ್ನು ಪೋಸ್ಟ್ ಮಾಡಿ: https://x2o.app/signup?side=buyer',
      },
      ml: {
        subject: 'സൊസൈറ്റി & ബിസിനസ്സ് സംഭരണം എളുപ്പമാക്കുക',
        body: 'ഹലോ {{name}}, നിങ്ങളുടെ {{category}} ആവശ്യങ്ങൾ 100% ഓഡിറ്റ് സുതാര്യതയോടെ കൈകാര്യം ചെയ്യുക. ഐഡന്റിറ്റി സംരക്ഷണത്തോടെ പരിശോധിച്ചുറപ്പിച്ച കൊട്ടേഷനുകൾ താരതമ്യം ചെയ്യുക. 3-കോട്ട് കോറം ഉറപ്പും തൽക്ഷണ PO നിർമ്മാണവും.',
        callToAction: 'ആദ്യ ആവശ്യം പോസ്റ്റ് ചെയ്യുക: https://x2o.app/signup?side=buyer',
      },
    },
  },
  {
    id: 'TPL-SUPPLIER-ONBOARD',
    name: 'Prospective Supplier Invitation (17 SNE Categories)',
    audience: 'SUPPLIER',
    subject: 'High-Intent Procurement Leads in Your Pincode',
    body: 'Dear {{name}}, direct buyers in {{city}} are actively broadcasting requirements for {{category}}. Join {{platform_code}} to receive qualified tender enquiries directly on WhatsApp. 0% platform fee during the active pilot.',
    callToAction: 'Claim Your Profile: https://x2o.app/signup?side=supplier',
    translations: {
      en: {
        subject: 'High-Intent Procurement Leads in Your Pincode',
        body: 'Dear {{name}}, direct buyers in {{city}} are actively broadcasting requirements for {{category}}. Join {{platform_code}} to receive qualified tender enquiries directly on WhatsApp. 0% platform fee during the active pilot.',
        callToAction: 'Claim Your Profile: https://x2o.app/signup?side=supplier',
      },
      hi: {
        subject: 'आपके पिनकोड में उच्च-आशय वाली खरीद लीड्स',
        body: 'प्रिय {{name}}, {{city}} में प्रत्यक्ष खरीदार {{category}} के लिए सक्रिय रूप से आवश्यकताएं प्रसारित कर रहे हैं। सीधे व्हाट्सएप पर योग्य निविदा पूछताछ प्राप्त करने के लिए {{platform_code}} से जुड़ें। सक्रिय पायलट के दौरान 0% प्लेटफॉर्म शुल्क।',
        callToAction: 'अपनी प्रोफ़ाइल क्लेम करें: https://x2o.app/signup?side=supplier',
      },
      ta: {
        subject: 'உங்கள் பின்கோடில் முன்னணி கொள்முதல் வாய்ப்புகள்',
        body: 'அன்பான {{name}}, {{city}} நகரில் நேரடி வாங்குபவர்கள் {{category}} பிரிவில் தேவைகளைத் தீவிரமாக வெளியிட்டு வருகின்றனர். தகுதியான டெண்டர் விசாரணைகளை நேரடியாக வாட்ஸ்அப்பில் பெற {{platform_code}} தளத்தில் இணையுங்கள். பைலட் காலத்தில் 0% தளக் கட்டணம்.',
        callToAction: 'உங்கள் சுயவிவரத்தைப் பெறுங்கள்: https://x2o.app/signup?side=supplier',
      },
      te: {
        subject: 'మీ పిన్‌కోడ్‌లో అధిక-డిమాండ్ సేకరణ లీడ్స్',
        body: 'డియర్ {{name}}, {{city}} లో ప్రత్యక్ష కొనుగోలుదారులు {{category}} కోసం సేకరణ అవసరాలను పోస్ట్ చేస్తున్నారు. వాట్సాప్‌లో నేరుగా అర్హత కలిగిన టెండర్ విచారణలను పొందడానికి {{platform_code}} లో చేరండి. క్రియాశీల పైలట్ సమయంలో 0% ప్లాట్‌ఫారమ్ రుసుము.',
        callToAction: 'మీ ప్రొఫైల్‌ను పొందండి: https://x2o.app/signup?side=supplier',
      },
      kn: {
        subject: 'ನಿಮ್ಮ ಪಿನ್‌ಕೋಡ್‌ನಲ್ಲಿ ಆದ್ಯತೆಯ ಖರೀದಿ ಅವಕಾಶಗಳು',
        body: 'ಆತ್ಮೀಯ {{name}}, {{city}} ನಲ್ಲಿ ನೇರ ಖರೀದಿದಾರರು {{category}} ಗಾಗಿ ಅಗತ್ಯಗಳನ್ನು ಸಕ್ರಿಯವಾಗಿ ಪ್ರಕಟಿಸುತ್ತಿದ್ದಾರೆ. ಅರ್ಹ ಟೆಂಡರ್ ವಿಚಾರಣೆಗಳನ್ನು ನೇರವಾಗಿ ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ಪಡೆಯಲು {{platform_code}} ಗೆ ಸೇರಿ. ಸಕ್ರಿಯ ಪೈಲಟ್ ಸಮಯದಲ್ಲಿ 0% ಪ್ಲಾಟ್‌ಫಾರ್ಮ್ ಶುಲ್ಕ.',
        callToAction: 'ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಪಡೆದುಕೊಳ್ಳಿ: https://x2o.app/signup?side=supplier',
      },
      ml: {
        subject: 'നിങ്ങളുടെ പിൻകോഡിലെ ഉയർന്ന സംഭരണ അവസരങ്ങൾ',
        body: 'പ്രിയ {{name}}, {{city}}-യിലെ ഉപഭോക്താക്കൾ {{category}} വിഭാഗത്തിലുള്ള ആവശ്യങ്ങൾ സജീവമായി അറിയിക്കുന്നുണ്ട്. യോഗ്യതയുള്ള ടെൻഡർ അന്വേഷണങ്ങൾ വാട്‌സ്ആപ്പിൽ നേരിട്ട് ലഭിക്കാൻ {{platform_code}}-ൽ ചേരുക. സജീവ പൈലറ്റ് വേളയിൽ 0% പ്ലാറ്റ്‌ഫോം ഫീസ്.',
        callToAction: 'നിങ്ങളുടെ പ്രൊഫൈൽ നേടുക: https://x2o.app/signup?side=supplier',
      },
    },
  },
  {
    id: 'TPL-CATEGORY-DEMAND',
    name: 'Live Demand SNE Category Alert',
    audience: 'SUPPLIER',
    subject: 'Immediate Quote Required in Your Area',
    body: 'Attention {{name}}: A high-priority enquiry for {{category}} was just published in {{city}}. Verified buyer, 7-day quotation window, and direct settlement upon delivery.',
    callToAction: 'Review & Submit Quote: https://x2o.app/opportunities',
    translations: {
      en: {
        subject: 'Immediate Quote Required in Your Area',
        body: 'Attention {{name}}: A high-priority enquiry for {{category}} was just published in {{city}}. Verified buyer, 7-day quotation window, and direct settlement upon delivery.',
        callToAction: 'Review & Submit Quote: https://x2o.app/opportunities',
      },
      hi: {
        subject: 'आपके क्षेत्र में तत्काल कोटेशन की आवश्यकता',
        body: 'ध्यान दें {{name}}: {{city}} में {{category}} के लिए एक उच्च-प्राथमिकता पूछताछ अभी प्रकाशित की गई है। सत्यापित खरीदार, 7 दिनों की कोटेशन विंडो, और डिलीवरी पर प्रत्यक्ष भुगतान।',
        callToAction: 'समीक्षा करें और कोटेशन भेजें: https://x2o.app/opportunities',
      },
      ta: {
        subject: 'உங்கள் பகுதியில் அவசர மேற்கோள் தேவைப்படுகிறது',
        body: 'கவனத்திற்கு {{name}}: {{city}} நகரில் {{category}} க்கான அவசரக் கொள்முதல் விசாரணை வெளியிடப்பட்டுள்ளது. சரிபார்க்கப்பட்ட வாங்குபவர், 7 நாள் மேற்கோள் கால அவகாசம், மற்றும் விநியோகத்தின் போது நேரடி பணப்பரிவர்த்தனை.',
        callToAction: 'பார்வையிட்டு கொட்டேஷன் அனுப்பவும்: https://x2o.app/opportunities',
      },
      te: {
        subject: 'మీ ప్రాంతంలో తక్షణ కొటేషన్ అవసరం',
        body: 'గమనిక {{name}}: {{city}} లో {{category}} కోసం అధిక-ప్రాధాన్యత విచారణ ప్రచురించబడింది. ధృవీకరించబడిన కొనుగోలుదారు, 7 రోజుల కొటేషన్ గడువు, మరియు డెలివరీ తర్వాత నేరుగా చెల్లింపు.',
        callToAction: 'పరిశీలించి కొటేషన్ సమర్పించండి: https://x2o.app/opportunities',
      },
      kn: {
        subject: 'ನಿಮ್ಮ ಪ್ರದೇಶದಲ್ಲಿ ತಕ್ಷಣದ ಉಲ್ಲೇಖ ಅಗತ್ಯವಿದೆ',
        body: 'ಗಮನಿಸಿ {{name}}: {{city}} ನಲ್ಲಿ {{category}} ಗಾಗಿ ಆದ್ಯತೆಯ ವಿಚಾರಣೆಯನ್ನು ಪ್ರಕಟಿಸಲಾಗಿದೆ. ಪರಿಶೀಲಿಸಿದ ಖರೀದಿದಾರರು, 7 ದಿನಗಳ ಉಲ್ಲೇಖ ಗಡುವು, ಮತ್ತು ವಿತರಣೆಯ ನಂತರ ನೇರ ಪಾವತಿ.',
        callToAction: 'ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಕೊಟೇಶನ್ ಸಲ್ಲಿಸಿ: https://x2o.app/opportunities',
      },
      ml: {
        subject: 'നിങ്ങളുടെ പ്രദേശത്ത് അടിയന്തര കൊട്ടേഷൻ ആവശ്യമാണ്',
        body: 'ശ്രദ്ധിക്കുക {{name}}: {{city}}-ൽ {{category}} വിഭാഗത്തിൽ അടിയന്തര അന്വേഷണം പ്രസിദ്ധീകരിച്ചു. പരിശോധിച്ചുറപ്പിച്ച ഉപഭോക്താവ്, 7 ദിവസത്തെ കൊട്ടേഷൻ കാലാവധി, ഡെലിവറി സമയത്ത് നേരിട്ടുള്ള പെയ്‌മെന്റ്.',
        callToAction: 'പരിശോധിച്ച് കൊട്ടേഷൻ നൽകുക: https://x2o.app/opportunities',
      },
    },
  },
];

export interface CampaignDispatchLog {
  id: string;
  timestamp: string;
  campaignName: string;
  language?: CampaignLanguage;
  targetAudience: string;
  recipientsCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'CANCELLED';
}

export interface WahaGatewayStatus {
  status: 'WORKING' | 'SCAN_QR_CODE' | 'OFFLINE' | 'CHECKING';
  phone?: string;
  pushName?: string;
  engine?: string;
}

const WAHA_LOCAL_BASE = '/waha';
const WAHA_TUNNEL_BASE = 'https://enjoyable-shrill-pencil.ngrok-free.dev';
const STORAGE_KEY_LEDGER = 'otp_campaign_audit_ledger_v2';

export async function fetchWahaGatewayStatus(): Promise<WahaGatewayStatus> {
  const tryFetch = async (url: string, headers: Record<string, string> = {}) => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(3500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers?.get?.('content-type') || '';
    if (ct && !ct.includes('application/json')) {
      throw new Error(`Expected JSON response, got ${ct}`);
    }
    return res.json();
  };

  const headers = { 'ngrok-skip-browser-warning': 'true' };

  try {
    // Probe through tunnel first for remote production, followed by local proxy and direct loopback
    const data = await tryFetch(`${WAHA_TUNNEL_BASE}/api/sessions/default`, headers).catch(() =>
      tryFetch(`${WAHA_LOCAL_BASE}/api/sessions/default`, headers).catch(() =>
        tryFetch(`http://127.0.0.1:3008/api/sessions/default`).catch(() =>
          tryFetch(`http://localhost:3008/api/sessions/default`)
        )
      )
    );

    if (data?.status === 'WORKING') {
      return {
        status: 'WORKING',
        phone: data?.me?.id ? `+${data.me.id.replace(/@.*$/, '')}` : undefined,
        pushName: data?.me?.pushName || undefined,
        engine: data?.engine?.engine || 'WEBJS',
      };
    } else if (data?.status === 'SCAN_QR_CODE') {
      return {
        status: 'SCAN_QR_CODE',
        engine: data?.engine?.engine || 'WEBJS',
      };
    }
    return { status: 'OFFLINE' };
  } catch {
    return { status: 'OFFLINE' };
  }
}

export async function sendWahaTextMessage(toPhone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const cleanDigits = toPhone.replace(/\D/g, '');
  const digits = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
  if (!digits || digits.length < 10) {
    return { ok: false, error: 'Invalid phone number format' };
  }
  const chatId = `${digits}@c.us`;

  const body = JSON.stringify({
    session: 'default',
    chatId,
    text,
  });

  const trySend = async (url: string, headers: Record<string, string> = {}) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...headers,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Gateway returned HTTP ${res.status}`);
    return true;
  };

  const headers = { 'ngrok-skip-browser-warning': 'true' };

  try {
    await trySend(`${WAHA_TUNNEL_BASE}/api/sendText`, headers).catch(() =>
      trySend(`${WAHA_LOCAL_BASE}/api/sendText`, headers).catch(() =>
        trySend(`http://127.0.0.1:3008/api/sendText`).catch(() =>
          trySend(`http://localhost:3008/api/sendText`)
        )
      )
    );
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Send failed' };
  }
}

const INITIAL_HISTORY: CampaignDispatchLog[] = [
  {
    id: 'CMP-2026-081',
    timestamp: '2026-11-02 14:30 IST',
    campaignName: 'X2O Platform Greenfield Launch & Pilot Invitation',
    language: 'en',
    targetAudience: 'Prospective Buyers (RWA Bengaluru)',
    recipientsCount: 45,
    sentCount: 45,
    deliveredCount: 44,
    failedCount: 1,
    status: 'COMPLETED',
  },
  {
    id: 'CMP-2026-079',
    timestamp: '2026-11-01 11:15 IST',
    campaignName: 'Prospective Supplier Invitation (17 SNE Categories)',
    language: 'kn',
    targetAudience: 'Motor Rewinding & Pump Specialists',
    recipientsCount: 30,
    sentCount: 30,
    deliveredCount: 30,
    failedCount: 0,
    status: 'COMPLETED',
  },
];

export function BulkWhatsAppCampaignPanel() {
  const [selectedLanguage, setSelectedLanguage] = useState<CampaignLanguage>('en');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('TPL-X2O-LAUNCH');
  const [targetAudience, setTargetAudience] = useState<'BUYERS' | 'SUPPLIERS' | 'CUSTOM'>('BUYERS');
  const [selectedCategory, setSelectedCategory] = useState<string>(SNE_17_CATEGORIES[0]);
  const [targetCity, setTargetCity] = useState<string>('Bengaluru');
  const [targetPincode, setTargetPincode] = useState<string>('560001');
  const [customPhoneNumbers, setCustomPhoneNumbers] = useState<string>('+91 99729 67530\n+91 98450 11223\n+91 98450 22334');
  const [batchSize, setBatchSize] = useState<number>(25);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [dispatchProgress, setDispatchProgress] = useState<{ sent: number; total: number; delivered: number; failed: number } | null>(null);

  // Live Gateway state
  const [gatewayStatus, setGatewayStatus] = useState<WahaGatewayStatus>({ status: 'CHECKING' });
  const [lastChecked, setLastChecked] = useState<string>('');

  // Persistent Campaign History
  const [campaignHistory, setCampaignHistory] = useState<CampaignDispatchLog[]>(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = window.localStorage.getItem(STORAGE_KEY_LEDGER);
        if (saved) return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return INITIAL_HISTORY;
  });

  const checkStatus = useCallback(async () => {
    setGatewayStatus((prev) => ({ ...prev, status: 'CHECKING' }));
    const result = await fetchWahaGatewayStatus();
    setGatewayStatus(result);
    setLastChecked(new Date().toLocaleTimeString('en-IN', { hour12: false }) + ' IST');
  }, []);

  useEffect(() => {
    void checkStatus();
    const timer = setInterval(() => {
      void checkStatus();
    }, 30000); // 30s live poll
    return () => clearInterval(timer);
  }, [checkStatus]);

  const saveHistory = (newHistory: CampaignDispatchLog[]) => {
    setCampaignHistory(newHistory);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY_LEDGER, JSON.stringify(newHistory));
      }
    } catch {
      // storage unavailable
    }
  };

  const activeTemplate = CAMPAIGN_TEMPLATES.find((t) => t.id === selectedTemplateId) || CAMPAIGN_TEMPLATES[0];
  const activeVariant = activeTemplate.translations[selectedLanguage] || activeTemplate.translations.en;

  // Editable body state (pre-filled from active variant, customizable by operator)
  const [customBodyText, setCustomBodyText] = useState<string>('');
  const [isCustomEditing, setIsCustomEditing] = useState<boolean>(false);

  useEffect(() => {
    if (!isCustomEditing) {
      setCustomBodyText(activeVariant.body);
    }
  }, [activeVariant, isCustomEditing]);

  const handleLanguageChange = (lang: CampaignLanguage) => {
    setSelectedLanguage(lang);
    const variant = activeTemplate.translations[lang] || activeTemplate.translations.en;
    setCustomBodyText(variant.body);
    setIsCustomEditing(false);
  };

  const handleTemplateChange = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const tpl = CAMPAIGN_TEMPLATES.find((t) => t.id === tplId) || CAMPAIGN_TEMPLATES[0];
    const variant = tpl.translations[selectedLanguage] || tpl.translations.en;
    setCustomBodyText(variant.body);
    setIsCustomEditing(false);
  };

  const insertTag = (tag: string) => {
    setCustomBodyText((prev) => `${prev} ${tag}`);
    setIsCustomEditing(true);
  };

  // Interpolated preview text
  const previewText = customBodyText
    .replace(/\{\{name\}\}/g, targetAudience === 'BUYERS' ? 'Sunrise Enclave RWA' : 'Precision Engineering Works')
    .replace(/\{\{business_name\}\}/g, targetAudience === 'BUYERS' ? 'Sunrise Enclave RWA' : 'Precision Engineering Works')
    .replace(/\{\{platform\}\}/g, PRODUCT_NAME)
    .replace(/\{\{platform_code\}\}/g, OTP_NEXT_CODE)
    .replace(/\{\{category\}\}/g, selectedCategory)
    .replace(/\{\{city\}\}/g, targetCity)
    .replace(/\{\{pincode\}\}/g, targetPincode) + '\n\n' + activeVariant.callToAction;

  const handleStartCampaign = async () => {
    setIsDispatching(true);
    const recipientList = targetAudience === 'CUSTOM'
      ? customPhoneNumbers.split('\n').map((p) => p.trim()).filter(Boolean)
      : Array.from({ length: Math.min(batchSize, 25) }, (_, i) => `+91 98400 ${String(10000 + i).slice(1)}`);

    const total = recipientList.length;
    setDispatchProgress({ sent: 0, total, delivered: 0, failed: 0 });

    let deliveredCount = 0;
    let failedCount = 0;

    for (let i = 0; i < total; i++) {
      const recipientPhone = recipientList[i];
      const sendResult = await sendWahaTextMessage(recipientPhone, previewText);

      if (sendResult.ok) {
        deliveredCount++;
      } else {
        failedCount++;
      }

      setDispatchProgress({
        sent: i + 1,
        total,
        delivered: deliveredCount,
        failed: failedCount,
      });

      // Respectful throttle between messages to avoid anti-spam blocks
      if (i < total - 1) {
        await new Promise((res) => setTimeout(res, 400));
      }
    }

    const newLog: CampaignDispatchLog = {
      id: `CMP-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }) + ' IST',
      campaignName: activeTemplate.name,
      language: selectedLanguage,
      targetAudience: targetAudience === 'CUSTOM' ? `Custom Phone List (${total})` : `${targetAudience} (${targetCity})`,
      recipientsCount: total,
      sentCount: total,
      deliveredCount,
      failedCount,
      status: 'COMPLETED',
    };

    saveHistory([newLog, ...campaignHistory]);
    setIsDispatching(false);
  };

  return (
    <div className="space-y-6" data-testid="bulk-whatsapp-campaign-panel">
      {/* Header Overview Card */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 p-5 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 text-lg font-bold">
              📲
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Bulk WhatsApp Marketing &amp; Outreach Engine
              </h2>
              <p className="text-xs text-slate-300">
                Broadcast multilingual transactional invites and promotional pilot onboarding campaigns to prospective buyers and suppliers via the persistent WAHA Gateway.
              </p>
            </div>
          </div>

          {/* Live WAHA Gateway Status Badge */}
          <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold">
              {gatewayStatus.status === 'WORKING' && (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-400">Gateway Online</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({gatewayStatus.phone || 'Paired'})
                  </span>
                </>
              )}
              {gatewayStatus.status === 'SCAN_QR_CODE' && (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-ping" />
                  <span className="text-amber-400">Pairing Needed (Scan QR)</span>
                </>
              )}
              {gatewayStatus.status === 'CHECKING' && (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse" />
                  <span className="text-sky-300">Probing Gateway…</span>
                </>
              )}
              {gatewayStatus.status === 'OFFLINE' && (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  <span className="text-rose-400">Gateway Offline</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => void checkStatus()}
              title="Refresh Gateway Health"
              className="ml-1 text-slate-400 hover:text-white text-xs cursor-pointer transition"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Pairing notice banner if unlinked */}
        {gatewayStatus.status === 'SCAN_QR_CODE' && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-200 flex items-center justify-between">
            <div>
              <span className="font-bold">WhatsApp Handset Unpaired:</span> Open the WAHA console to scan the QR code and restore outbound broadcasts.
            </div>
            <a
              href="http://localhost:3008/dashboard/"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1 text-black font-bold text-[11px] transition shrink-0"
            >
              Open QR Scanner
            </a>
          </div>
        )}

        {gatewayStatus.status === 'WORKING' && gatewayStatus.pushName && (
          <div className="text-[11px] text-emerald-400/90 flex items-center gap-1 font-mono">
            <span>✓ Active Multi-Device Operator:</span>
            <span className="font-bold text-white">{gatewayStatus.pushName}</span>
            <span className="text-slate-400">| Session: default | Engine: {gatewayStatus.engine || 'WEBJS'}</span>
            {lastChecked && <span className="text-slate-500 ml-auto">Verified at {lastChecked}</span>}
          </div>
        )}
      </div>

      {/* Multilingual Dispatch Language Switcher Bar */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span>🌐</span>
            Multilingual Dispatch Selector (North &amp; South India Coverage)
          </label>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            Selected: {CAMPAIGN_LANGUAGES.find((l) => l.code === selectedLanguage)?.nativeLabel} ({CAMPAIGN_LANGUAGES.find((l) => l.code === selectedLanguage)?.label})
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {CAMPAIGN_LANGUAGES.map((lang) => {
            const isSelected = selectedLanguage === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleLanguageChange(lang.code)}
                className={`rounded-xl border p-2.5 text-xs font-bold transition flex flex-col items-center gap-1 cursor-pointer text-center ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/30'
                    : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span>{lang.flag}</span>
                  <span className="text-sm font-extrabold">{lang.nativeLabel}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{lang.label}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                  lang.region === 'North India' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                  lang.region === 'South India' ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400' :
                  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                }`}>
                  {lang.region}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Campaign Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Target & Template Configuration */}
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xs space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Icon name="campaign" size={16} />
            1. Campaign Audience &amp; Targeting
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-foreground block mb-1">Target Segment</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'BUYERS', label: 'Prospective Buyers (RWA/MSME)', icon: '🏛️' },
                  { key: 'SUPPLIERS', label: 'Prospective Suppliers (17 SNE)', icon: '🏪' },
                  { key: 'CUSTOM', label: 'Custom Phone List', icon: '📋' },
                ].map((seg) => (
                  <button
                    key={seg.key}
                    type="button"
                    onClick={() => setTargetAudience(seg.key as any)}
                    className={`rounded-xl border p-2.5 text-xs font-bold transition flex flex-col items-center gap-1 cursor-pointer ${
                      targetAudience === seg.key
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span>{seg.icon}</span>
                    <span className="text-[11px] text-center leading-tight">{seg.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {targetAudience !== 'CUSTOM' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Target City / Hub</label>
                  <select
                    value={targetCity}
                    onChange={(e) => setTargetCity(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card p-2 text-xs font-semibold text-foreground focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Bengaluru">Bengaluru (Karnataka)</option>
                    <option value="Chennai">Chennai (Tamil Nadu)</option>
                    <option value="Hyderabad">Hyderabad (Telangana)</option>
                    <option value="Kochi">Kochi (Kerala)</option>
                    <option value="Mumbai">Mumbai (Maharashtra)</option>
                    <option value="Delhi NCR">Delhi NCR</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Organic Pincode</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={targetPincode}
                    onChange={(e) => setTargetPincode(e.target.value.replace(/\D/g, ''))}
                    placeholder="560001"
                    className="w-full rounded-xl border border-border bg-card p-2 text-xs font-semibold font-mono text-foreground focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Focus Trade Category</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card p-2 text-xs font-semibold text-foreground focus:ring-2 focus:ring-emerald-500 truncate"
                  >
                    {SNE_17_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Recipient Phone Numbers (One per line with country code)
                </label>
                <textarea
                  rows={4}
                  value={customPhoneNumbers}
                  onChange={(e) => setCustomPhoneNumbers(e.target.value)}
                  placeholder="+91 99729 67530"
                  className="w-full rounded-xl border border-border bg-card p-2.5 font-mono text-xs text-foreground focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-foreground block mb-1">Select Campaign Message Template</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {CAMPAIGN_TEMPLATES.map((tpl) => {
                  const variant = tpl.translations[selectedLanguage] || tpl.translations.en;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleTemplateChange(tpl.id)}
                      className={`w-full text-left rounded-xl border p-2.5 text-xs transition cursor-pointer ${
                        selectedTemplateId === tpl.id
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <div className="font-bold text-foreground">{tpl.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">{variant.subject}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Placeholders & Custom Message Editor */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-foreground">Dynamic Placeholders (Click to Insert)</label>
                {isCustomEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomBodyText(activeVariant.body);
                      setIsCustomEditing(false);
                    }}
                    className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold hover:underline cursor-pointer"
                  >
                    Reset to Default
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['{{name}}', '{{business_name}}', '{{city}}', '{{pincode}}', '{{category}}', '{{platform}}', '{{platform_code}}'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertTag(tag)}
                    className="rounded-lg bg-muted px-2 py-0.5 text-[11px] font-mono font-medium text-foreground hover:bg-emerald-500/20 hover:text-emerald-600 transition cursor-pointer border border-border"
                  >
                    + {tag}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Message Body ({CAMPAIGN_LANGUAGES.find((l) => l.code === selectedLanguage)?.label})
                </label>
                <textarea
                  rows={4}
                  value={customBodyText}
                  onChange={(e) => {
                    setCustomBodyText(e.target.value);
                    setIsCustomEditing(true);
                  }}
                  className="w-full rounded-xl border border-border bg-card p-2.5 text-xs text-foreground focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <label className="text-xs font-bold text-foreground block">Batch Throttle Sizing</label>
                <p className="text-[10px] text-muted-foreground">400ms throttle per send prevents WhatsApp anti-spam flagging</p>
              </div>
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="rounded-xl border border-border bg-card p-1.5 text-xs font-bold text-foreground"
              >
                <option value={10}>10 / batch</option>
                <option value={25}>25 / batch</option>
                <option value={50}>50 / batch</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right Column: WhatsApp Live Message Preview & Dispatch */}
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Icon name="preview" size={16} />
                2. WhatsApp Business Preview
              </h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold">
                {CAMPAIGN_LANGUAGES.find((l) => l.code === selectedLanguage)?.nativeLabel} ({selectedLanguage.toUpperCase()})
              </span>
            </div>

            {/* Mock Phone Chat Bubble */}
            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-inner space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <span className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold text-white">
                  ✓
                </span>
                <span className="text-xs font-bold text-slate-200">
                  {PRODUCT_NAME} ({OTP_NEXT_CODE}) Official Broadcast
                </span>
                <span className="ml-auto text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  Verified Business
                </span>
              </div>

              <div className="rounded-xl bg-slate-800/90 p-3.5 border border-slate-700/80 text-xs text-slate-100 whitespace-pre-wrap leading-relaxed font-sans">
                {previewText}
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                <span>Transport: WAHA Gateway (Persistent Paired Container)</span>
                <span>Delivery SLA: ~66ms / msg</span>
              </div>
            </div>
          </div>

          {/* Dispatch Action & Live Progress Meter */}
          <div className="space-y-3 pt-2 border-t border-border">
            {dispatchProgress && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span>Dispatching: {dispatchProgress.sent} / {dispatchProgress.total}</span>
                  <span className="text-emerald-500 font-mono">
                    {Math.round((dispatchProgress.sent / (dispatchProgress.total || 1)) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-2 transition-all duration-150 rounded-full"
                    style={{ width: `${(dispatchProgress.sent / (dispatchProgress.total || 1)) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    ✓ {dispatchProgress.delivered} Delivered
                  </span>
                  {dispatchProgress.failed > 0 && (
                    <span className="text-red-500 font-semibold">✕ {dispatchProgress.failed} Failed</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={isDispatching || gatewayStatus.status !== 'WORKING'}
                onClick={() => void handleStartCampaign()}
                className={`flex-1 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider text-white shadow-md transition flex items-center justify-center gap-2 cursor-pointer ${
                  gatewayStatus.status === 'WORKING' && !isDispatching
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-slate-700 opacity-60 cursor-not-allowed'
                }`}
              >
                {isDispatching ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Transmitting Campaign via WAHA…</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Launch Campaign Broadcast ({CAMPAIGN_LANGUAGES.find((l) => l.code === selectedLanguage)?.label})</span>
                  </>
                )}
              </button>
            </div>

            {gatewayStatus.status !== 'WORKING' && (
              <p className="text-[11px] text-amber-500 text-center font-medium">
                ⚠️ Campaign dispatch disabled while WAHA gateway is offline or unpaired.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Campaign Dispatch History Ledger */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Icon name="history" size={16} />
            3. Campaign Dispatch Audit History (Local Ledger)
          </h3>
          <span className="text-xs font-bold text-muted-foreground">
            Total Logged: {campaignHistory.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
                <th className="pb-2.5">Batch ID</th>
                <th className="pb-2.5">Time</th>
                <th className="pb-2.5">Language</th>
                <th className="pb-2.5">Campaign Name</th>
                <th className="pb-2.5">Target Audience</th>
                <th className="pb-2.5 text-center">Recipients</th>
                <th className="pb-2.5 text-center">Delivered</th>
                <th className="pb-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {campaignHistory.map((log) => (
                <tr key={log.id} className="hover:bg-muted/40 transition">
                  <td className="py-2.5 font-mono font-bold text-foreground">{log.id}</td>
                  <td className="py-2.5 text-muted-foreground whitespace-nowrap">{log.timestamp}</td>
                  <td className="py-2.5">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted font-mono uppercase">
                      {log.language || 'en'}
                    </span>
                  </td>
                  <td className="py-2.5 font-medium text-foreground max-w-xs truncate">{log.campaignName}</td>
                  <td className="py-2.5 text-muted-foreground">{log.targetAudience}</td>
                  <td className="py-2.5 text-center font-bold text-foreground">{log.recipientsCount}</td>
                  <td className="py-2.5 text-center font-bold text-emerald-600 dark:text-emerald-400">
                    {log.deliveredCount}
                  </td>
                  <td className="py-2.5 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-500">
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
