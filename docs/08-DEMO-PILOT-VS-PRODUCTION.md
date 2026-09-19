# 08. Demo/Pilot Mode vs. Production Architecture

## 1. Architectural Distinction & Isolation

The OTP Platform is designed to operate in two distinct modes controlled by the `VITE_DEMO_MODE` environment variable:

| Dimension | Demo / Sandbox Mode (`VITE_DEMO_MODE=true`) | Live Production Mode (`VITE_DEMO_MODE=false`) |
| :--- | :--- | :--- |
| **Authentication** | Demo Account Switcher with 1-click login buttons | GoTrue JWT Authentication via Email OTP / Password |
| **Supplier Network** | 16 Verified Domain Suppliers with automated quote generation | Real registered Indian suppliers with live WhatsApp notices |
| **Data Scope** | Synthetic RFQs, sample societies, and demo wallets | Real commercial organizations, binding contracts, and actual wallets |
| **Super Administrator** | Evaluates demo scenario states and resets data | Real Superadmin (**Baskar Loganathan**, `bvnbasu@gmail.com`) |
| **WhatsApp Messaging** | Mock responses or paired test gateway | Live WAHA Webhook dispatch to vendor mobile phones |
| **Linear Engine** | 15-Step Linear Monotonic Procurement Engine | 15-Step Linear Monotonic Procurement Engine |
| **Financial Ledger** | Simulated double-entry ledger & demo wallet credits | Real double-entry ledger, 0.50% fee, 0.10% buyer reward |

---

## 2. Benchmark Pilot Organization

To ensure reliable end-to-end verification and integration benchmarks, migration `00115` seeded a canonical benchmark organization:
- **Organization Name**: `Greenview Heights RWA (Pilot Benchmark)`
- **Organization Type**: `COMMUNITY`
- **Primary Owner**: Greenview RWA Lead (`manager@greenview.test`, ID: `b0000000-0000-4000-8000-000000000001`)
- **Platform SuperAdmin**: Baskar Loganathan (`bvnbasu@gmail.com`) & OTP Platform SuperAdmin (`admin@otp.test`) — Pure Platform Administration role with strict cross-tenant isolation (0 buyer/supplier memberships).

---

## 3. Verified Domain Suppliers Reference (01 to 04 per Domain)

The platform maintains 16 standardized domain suppliers configured with valid GSTINs, bank details, and product catalogs across 5 key institutional domains:

### 1. 🪑 Furniture, Workstations & Interior Fitouts
- `furniture01@otpdemo.test` — **Classic Interiors Lead** (Modular Workstations & Ergonomic Seating)
- `furniture02@otpdemo.test` — **ErgoDesign Sales Lead** (Office & Society Boardroom Furniture)
- `furniture03@otpdemo.test` — **WoodCraft Commercial Rep** (Custom Teak & Commercial Joinery)
- `furniture04@otpdemo.test` — **SteelForm Operations** (Institutional Steel Storage & Racks)

### 2. ☀️ Solar & Power Infrastructure
- `solar01@otpdemo.test` — **SunPower Tech Lead** (Commercial Rooftop Solar EPC)
- `solar02@otpdemo.test` — **Aditya Solar Manager** (High-Efficiency Monocrystalline Systems)
- `solar03@otpdemo.test` — **EcoGreen EPC Director** (Society Grid-Tied Solar Plants)
- `solar04@otpdemo.test` — **Surya Shakti Contracts** (Hybrid Solar & Inverter Banks)

### 3. 📹 CCTV & Electronic Security Systems
- `cctv01@otpdemo.test` — **SecureVision Sales** (IP Surveillance & Perimeter Fiber CCTV)
- `cctv02@otpdemo.test` — **Falcon Eye Operations** (Access Control & License Plate Recognition)
- `cctv03@otpdemo.test` — **Optima Guard Lead** (AI Video Analytics & Society Entry Gates)
- `cctv04@otpdemo.test` — **Sentinel Security Manager** (Multi-Tower Surveillance Systems)

### 4. 💧 Water Filtration, RO Plants & Treatment
- `water01@otpdemo.test` — **PureAqua Tech Lead** (Industrial RO & Commercial Filtration)
- `water02@otpdemo.test` — **HydroTech Engineering** (Sewage Treatment & Water Softeners)
- `water03@otpdemo.test` — **ClearFlow Solutions Lead** (Society Centralized RO Plants)
- `water04@otpdemo.test` — **AquaPure Projects Lead** (Pumping & UV Disinfection Systems)

### 5. 🔥 Gas Piping, Reticulation & Manifolds
- `gas01@otpdemo.test` — **GasTech Projects Head** (Reticulated LPG Systems & Manifolds)
- `gas02@otpdemo.test` — **Bharat Gas Piping Lead** (PNG Copper Piping & Commercial Reticulation)
- `gas03@otpdemo.test` — **IndoGas Technical Lead** (High-Pressure Industrial Gas Infrastructure)
- `gas04@otpdemo.test` — **Apex Gas Piping Rep** (Gas Leak Detection & Emergency Safety Valves)

---

## 4. Production Clean State Reset & Demo Isolation (Migration 00184)

Implemented in migration `00184_production_clean_state_reset_and_demo_isolation.sql`:
1. **Strict Data Separation**: Complete isolation between synthetic sandbox records (`is_demo = true` or `mode = 'DEMO'`) and live production accounts.
2. **Deterministic Seed Reset**: `pnpm demo:reset` and `pnpm demo:seed` can reset demo environments without affecting live transactional ledgers.
3. **Production Safety Gate**: Destruction or purge of production data requires the explicit cryptographic confirmation token `PERMANENTLY_PURGE_PRODUCTION_DATA_I_AM_CERTAIN`.
4. **185 Contiguous Migrations**: All migration tables and test data generators conform strictly to the 185 PostgreSQL migration ledger.
