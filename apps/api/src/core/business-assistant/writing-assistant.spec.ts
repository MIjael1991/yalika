import { WritingAssistant, checkWritingOutput } from './writing-assistant';
import type { AuthenticatedUser } from '../../auth/auth.types';
const user={id:'u1',companyId:'c1',modules:['all']} as AuthenticatedUser;
describe('Writing proposals',()=>{
  const old={...process.env};
  afterEach(()=>{process.env= {...old};jest.restoreAllMocks();});
  it('rejects restricted users before sending text',async()=>{
    const fetcher=jest.spyOn(global,'fetch');
    await expect(new WritingAssistant().propose({text:'hola mundo',action:'spelling',consent:true},{...user,modules:['surveys']})).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires explicit consent',async()=>{await expect(new WritingAssistant().propose({text:'hola mundo',action:'spelling',consent:false},user)).rejects.toThrow();});
  it('does not pretend to correct without a configured provider',async()=>{delete process.env.GEMINI_API_KEY;await expect(new WritingAssistant().propose({text:'hola mundo',action:'spelling',consent:true},user)).rejects.toThrow('no está configurada');});
  it('rejects altered quantities and malformed output',()=>{expect(()=>checkWritingOutput('Precio 35.50', 'Precio 350')).toThrow();expect(()=>checkWritingOutput('Hola',null)).toThrow();});
  it('sends only explicit text and returns an unsaved proposal',async()=>{
    process.env.SURVEY_AI_PROVIDER='gemini';process.env.GEMINI_API_KEY='fixture';
    const fetcher=jest.spyOn(global,'fetch').mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'¿Te gustó el servicio?'}}]}),{status:200}));
    const s=new WritingAssistant();const r=await s.propose({text:'te gusto el servicio',action:'question',consent:true},user);
    expect(r.saved).toBe(false);expect(r.mode).toBe('proposal');
    const body=JSON.parse(fetcher.mock.calls[0][1]?.body as string);
    expect(body.messages[1].content).toBe('te gusto el servicio');expect(body).not.toHaveProperty('user');
    await expect(s.propose({text:'otro texto',action:'spelling',consent:true},user)).rejects.toThrow('Espera');
  });
  it('returns a safe error for provider failure',async()=>{
    process.env.SURVEY_AI_PROVIDER='gemini';process.env.GEMINI_API_KEY='fixture';jest.spyOn(global,'fetch').mockResolvedValue(new Response('<html>error</html>',{status:502}));
    await expect(new WritingAssistant().propose({text:'hola mundo',action:'spelling',consent:true},user)).rejects.toThrow('original no se modificó');
  });
});
