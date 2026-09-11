/**
 * ONDC Beckn Protocol v1.2 Standard Type Definitions for BAP (Buyer App Platform)
 */

export type OndcDomain =
  | 'ONDC:RET10' // Grocery & Consumables
  | 'ONDC:RET12' // Fashion & Textiles / Cotton Yarn
  | 'ONDC:RET14' // Electronics / CCTV & Surveillance
  | 'ONDC:SRV11' // Home Services & Maintenance / Electricals / Water
  | 'ONDC:B2B10' // B2B Industrial Goods (Cement, Steel, Capital Goods)
  | 'ONDC:SRV13'; // Commercial Facility AMC

export interface OndcContext {
  domain: OndcDomain | string;
  country: string; // "IND"
  city: string; // e.g. "std:080" (Bangalore), "std:0421" (Tiruppur)
  action:
    | 'search'
    | 'on_search'
    | 'select'
    | 'on_select'
    | 'init'
    | 'on_init'
    | 'confirm'
    | 'on_confirm'
    | 'status'
    | 'on_status'
    | 'track'
    | 'on_track'
    | 'cancel'
    | 'on_cancel';
  core_version: string; // "1.2.0"
  bap_id: string; // OTP BAP Subscriber ID (e.g. "bap.otp.network")
  bap_uri: string; // OTP BAP Callback URI (e.g. "https://api.otp.in/ondc/bap")
  bpp_id?: string; // Seller App Platform Subscriber ID
  bpp_uri?: string; // Seller App Platform URI
  transaction_id: string; // Global UUID for RFQ / transaction lifecycle
  message_id: string; // Unique UUID for request-callback pair
  timestamp: string; // ISO 8601 Timestamp
  ttl?: string; // e.g. "PT30S"
  key?: string;
}

export interface OndcDescriptor {
  name: string;
  code?: string;
  symbol?: string;
  short_desc?: string;
  long_desc?: string;
  images?: string[];
}

export interface OndcPrice {
  currency: string; // "INR"
  value: string; // formatted decimal e.g. "28000.00"
  maximum_value?: string;
}

export interface OndcItem {
  id: string;
  descriptor: OndcDescriptor;
  price?: OndcPrice;
  category_id?: string;
  fulfillment_id?: string;
  tags?: Array<{
    code: string;
    list: Array<{ code: string; value: string }>;
  }>;
}

export interface OndcProvider {
  id: string; // BPP Provider ID
  descriptor: OndcDescriptor;
  categories?: Array<{ id: string; descriptor: OndcDescriptor }>;
  items?: OndcItem[];
  fulfillments?: Array<{ id: string; type: string }>;
  locations?: Array<{ id: string; gps?: string; city?: { name: string; code: string } }>;
  rateable?: boolean;
  rating?: string;
}

export interface OndcCatalog {
  descriptor?: OndcDescriptor;
  providers?: OndcProvider[];
}

export interface OndcSearchIntent {
  item?: {
    descriptor?: {
      name?: string;
      tags?: Array<{ code: string; list: Array<{ code: string; value: string }> }>;
    };
  };
  category?: {
    descriptor?: {
      name?: string;
      code?: string;
    };
  };
  fulfillment?: {
    type?: string;
    end?: {
      location?: {
        gps?: string;
        address?: { area_code?: string; city?: string };
      };
    };
  };
  provider?: {
    descriptor?: { name?: string };
  };
}

export interface OndcQuoteBreakupItem {
  title: string;
  price: OndcPrice;
  item?: {
    id: string;
    descriptor: OndcDescriptor;
  };
  tags?: Array<{ code: string; list: Array<{ code: string; value: string }> }>;
}

export interface OndcQuote {
  price: OndcPrice;
  breakup?: OndcQuoteBreakupItem[];
  ttl?: string;
}

export interface OndcOrder {
  id?: string;
  state?: string;
  provider?: {
    id: string;
    descriptor?: OndcDescriptor;
  };
  items?: Array<{
    id: string;
    quantity: { count: number };
    price?: OndcPrice;
  }>;
  billing?: {
    name: string;
    phone: string;
    email?: string;
    address?: {
      door?: string;
      building?: string;
      street?: string;
      city?: string;
      state?: string;
      area_code?: string;
    };
    tax_number?: string;
  };
  fulfillments?: Array<{
    id?: string;
    type?: string;
    state?: { descriptor?: OndcDescriptor };
    end?: {
      contact?: { phone: string; email?: string };
      location?: { address?: { area_code?: string; city?: string } };
    };
  }>;
  quote?: OndcQuote;
  payment?: {
    uri?: string;
    type?: string;
    status?: string;
    params?: { amount: string; currency: string; transaction_id?: string };
  };
  created_at?: string;
  updated_at?: string;
}

export interface OndcAck {
  message: {
    ack: {
      status: 'ACK' | 'NACK';
    };
  };
  error?: {
    type?: string;
    code: string;
    path?: string;
    message: string;
  };
}

export interface OndcPayload<T> {
  context: OndcContext;
  message: T;
  error?: {
    type?: string;
    code: string;
    message: string;
  };
}
