import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {HttpsProxyAgent} from 'https-proxy-agent';
import {fileURLToPath} from 'node:url';
export default defineConfig(({command,mode})=>{
 const previewApi=loadEnv(mode,process.cwd(),'').CONGEO_PREVIEW_API;
 return {base:'./',resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},plugins:[react(),...(command==='serve'&&previewApi?[{name:'local-config',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url==='/config.js'){res.setHeader('Content-Type','application/javascript');res.end('window.CONGEO_API_URL=location.origin;');}else next();});}}]:[])],server:{allowedHosts:['terminal.local'],proxy:previewApi?{'/api':{target:previewApi,changeOrigin:true,agent:process.env.HTTPS_PROXY?new HttpsProxyAgent(process.env.HTTPS_PROXY):undefined,configure(proxy){proxy.on('proxyReq',req=>req.removeHeader('origin'));}}}:undefined}};
});
