import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone para Docker (reduz tamanho da imagem)
  output: "standalone",
  
  // Configuração de imagens (se precisar de domínios externos)
  images: {
    remotePatterns: [],
  },
  
  // Desabilita powered by header por segurança
  poweredByHeader: false,
};

export default nextConfig;
