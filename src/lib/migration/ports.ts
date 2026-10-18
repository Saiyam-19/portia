import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const PORT_ASSET_MANIFEST: Record<string, string> = {
  "bpcl-cargo-jetty/tarrifs.md": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "bpcl-liquid-cargo-jetty/BPCL Liquid Cargo Jetty SOR.md": "d912279df5d2c65dec94e8d18c20c3490ff796971086142dbd7f4aed81aa58b5",
  "bpcl-liquid-cargo-jetty/Lighterage.md": "ba0a6d9723f3163d019f430cea6e631f67a94cddeaad10d323507056e9222cd4",
  "gateway-terminals-india-pvt-ltd/tarrifs.md": "e1dbf88a9f0acbb995f24a23ba2a2c16c20df38dcc92fb8dfecc88b0d57c4a59",
  "ictpl/tarrifs.md": "7ca136466f49d534dcb2fcc3c4e6e3ac33bf3a04959105fe227c298edfb2804f",
  "jaigarh/jaigarh-tarrif.md": "8c4124c1ef6b6f7590d98f4e0067a320e32a5721a391b4261e7775c1ea54e0fe",
  "jawahar-nehru-port-authority-jnpa/JNPA SOR.md": "876e034b52c1631ad8452391287e0cc022d533cbb912b4c41eca070d8346e603",
  "jsw-jnpt-liquid-terminal/JSW JNPT Liquid Terminal Private Limited SOR.md": "03302a18228a543677ca05ef777d7e5444d0584aa3931a044e384f25a9f19b2c",
  "konkan-lng-ltd/tarrifs.md": "afdcb2f108b9b26e58ff525fa5c5a609c3ddeb3c1d9233d6f14c198f29fb7b2e",
  "mumbai-container-terminal/tarrifs.md": "b56dddefc1d4dfedb6040edd33cf5df3bd3aef6187ace14c211fad9f748e4957",
  "mumbai-cruise-terminal/tarrifs.md": "15499f3ed840a5767e9a1574789f4b3c20c8f9512187aafbd828c95b76f07ab6",
  "mumbai/tariffs.md": "bdd2d7f21783ab40e9c73aab9ba31bf113a57fe75162cfb8413a1d3cd54e611f",
  "nhava-sheva-freeport-terminal/Nhava Sheva Freeport Terminal Pvt Ltd SOR.md": "6ee4dd9ed667958e15587d89154647f8d9ece4d65b2dc185b67b1f3ad865083b",
  "nhava-sheva-gateway-terminal/NHAVA SHEVA (INDIA) GATEWAY TERMINAL PRIVATE LIMITED SOR.md": "3ef0b57bfb2cf41004f9bf863c952187091e13ca6cdced875a2e42e5d4a44127",
  "nhava-sheva-international-container-terminal/NHAVA SHEVA INTERNATIONAL CONTAINER TERMINAL PRIVATE LIMITED SOR.md": "83ca6b9ef2e55dfe46e5b82d567e7763b161cfa25438d98a2a607bc8e93564ae",
  "ranpar-finolex/tarrifs.md": "7d5828bb7f40ec67140c6bd897e7fc697c429335942f57da8f84da68a50332e7",
  "redi/tarrifs.md": "92cd1ca905b6024a05de48062a1776b164f6a8d5d9a513344422936917838006",
};

export const SUPPORTED_PORTS = [...new Set(
  Object.keys(PORT_ASSET_MANIFEST).map((relative) => relative.split("/")[0]!),
)].sort();

export async function loadPortTariffBundle(slug: string): Promise<string> {
  if (!SUPPORTED_PORTS.includes(slug)) throw new Error("Unsupported port identifier.");
  const entries = Object.entries(PORT_ASSET_MANIFEST)
    .filter(([relative]) => relative.startsWith(`${slug}/`))
    .sort(([left], [right]) => left.localeCompare(right));
  const documents = await Promise.all(entries.map(async ([relative, expectedHash]) => {
    const contents = await readFile(path.join(process.cwd(), "data", "ports", relative));
    const actualHash = createHash("sha256").update(contents).digest("hex");
    if (actualHash !== expectedHash) throw new Error(`Tariff asset checksum mismatch: ${relative}`);
    const text = contents.toString("utf8");
    return text.trim() ? `### ${path.basename(relative)}\n${text}` : "";
  }));
  return documents.filter(Boolean).join("\n\n");
}

// Identity-only mappings reviewed against the bundled headings/definitions and
// docs/portia-reliability/official-source-review.md. These grant no tariff authority.
export const PORT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "bpcl-cargo-jetty": ["BPCL Cargo Jetty"],
  "bpcl-liquid-cargo-jetty": ["BPCL Liquid Cargo Jetty"],
  "gateway-terminals-india-pvt-ltd": ["GTI", "Gateway Terminals India", "Gateway Terminal India", "Gateway Terminals India (GTI)", "Gateway Terminals India Private Limited", "Gateway Terminals India Pvt Ltd"],
  ictpl: ["ICTPL", "Indira Container Terminal"],
  jaigarh: ["Jaigarh", "JSW Jaigarh", "JSW Jaigarh Port Limited", "JSW Jaigarh Port Ltd"],
  "jawahar-nehru-port-authority-jnpa": ["JNPA", "JNPT", "Jawaharlal Nehru Port", "Jawahar Nehru Port", "Jawaharlal Nehru Port Authority", "Jawahar Nehru Port Authority"],
  "jsw-jnpt-liquid-terminal": ["JSW JNPT Liquid Terminal", "JSW JNPT Liquid Terminal Private Limited", "JJLTPL"],
  "konkan-lng-ltd": ["Konkan LNG", "KLL"],
  mumbai: ["Mumbai", "Mumbai Port", "Mumbai Port Authority", "MbPA", "MBPT", "Mumbai docks", "Mumbai Port docks", "MbPA docks"],
  "mumbai-container-terminal": ["BMCT", "Bharat Mumbai Container Terminal", "Bharat Mumbai Container Terminals", "PSA Mumbai"],
  "mumbai-cruise-terminal": ["Mumbai Cruise Terminal"],
  "nhava-sheva-freeport-terminal": ["NSFT", "NSFTPL", "Nhava Sheva Freeport Terminal", "Nhava Sheva Freeport Terminal Pvt Ltd", "Nhava Sheva Freeport Terminal Private Limited"],
  "nhava-sheva-gateway-terminal": ["NSIGT", "Nhava Sheva India Gateway Terminal", "Nhava Sheva Gateway Terminal", "Nhava Sheva (India) Gateway Terminal", "Nhava Sheva (India) Gateway Terminal Private Limited"],
  "nhava-sheva-international-container-terminal": ["NSICT", "Nhava Sheva International Container Terminal", "Nhava Sheva International Container Terminal Private Limited"],
  "ranpar-finolex": ["Ranpar", "Ranpar Finolex", "Finolex", "Finolex jetty", "Finolex terminal", "Finolex EDC jetty", "Finolex chemical jetty", "Finolex chemical EDC jetty", "Ranpar/Finolex chemical EDC jetty", "Finolex coal jetty", "Ranpar/Finolex coal jetty"],
  redi: ["Redi"],
};


export const AMBIGUOUS_PORT_NAMES: Readonly<Record<string, readonly string[]>> = {
  Gateway: ["gateway-terminals-india-pvt-ltd", "nhava-sheva-gateway-terminal"],
  "Nhava Sheva": ["jawahar-nehru-port-authority-jnpa", "nhava-sheva-freeport-terminal", "nhava-sheva-gateway-terminal", "nhava-sheva-international-container-terminal"],
  "Mumbai Container Terminal": ["mumbai-container-terminal", "ictpl"],
  BPCL: ["bpcl-cargo-jetty", "bpcl-liquid-cargo-jetty"],
  Adani: ["nhava-sheva-freeport-terminal"], // Even one catalog candidate does not identify an operator's terminal.
};
