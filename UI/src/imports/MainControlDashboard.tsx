export default function MainControlDashboard() {
  return (
    <div className="bg-white css-8zr56v relative size-full" data-name="Main Control Dashboard">
      <div className="absolute bg-[#d9d9d9] css-8zr56v h-[80px] left-0 top-0 w-[1440px]" data-name="Header" />
      <div className="absolute bg-[#d9d9d9] css-8zr56v h-[80px] left-0 top-[944px] w-[1440px]" data-name="Footer" />
      <div className="absolute bg-[#d9d9d9] css-8zr56v h-[864px] left-[1120px] top-[80px] w-[320px]" data-name="Sidebar" />
      <p className="absolute css-4hzbpn css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[41px] leading-[normal] left-[1142px] not-italic text-[16px] text-black top-[288px] w-[280px]">Robot State: Idle / Moving</p>
      <p className="absolute css-4hzbpn css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[41px] leading-[normal] left-[1142px] not-italic text-[16px] text-black top-[361px] w-[280px]">Active Controller: You / Read-only</p>
      <p className="absolute css-4hzbpn css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[41px] leading-[normal] left-[1142px] not-italic text-[16px] text-black top-[440px] w-[280px]">Target Square: A2</p>
      <p className="absolute css-4hzbpn css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[41px] leading-[normal] left-[1143px] not-italic text-[16px] text-black top-[519px] w-[280px]">Last Command: moveJ → A2</p>
      <div className="absolute bg-[#d9d9d9] css-8zr56v h-[600px] left-0 top-[80px] w-[1120px]" data-name="Board" />
      <div className="absolute bg-[#d9d9d9] css-8zr56v h-[264px] left-0 top-[680px] w-[1120px]" data-name="RemoteButtons & CLI" />
      <p className="absolute css-8zr56v css-ew64yg css-skt1ck font-['Inter:Bold',sans-serif] font-bold leading-[normal] left-[36px] not-italic text-[16px] text-black top-[702px]">{`Command  Controls:`}</p>
      <p className="absolute css-4hzbpn css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[33px] leading-[normal] left-[36px] not-italic text-[24px] text-black top-[25px] w-[283px]">UR Robot Web Control</p>
      <p className="absolute css-4hzbpn css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[27px] leading-[normal] left-[609px] not-italic text-[24px] text-black top-[26px] w-[276px]">Status: Connected</p>
      <p className="absolute css-4hzbpn css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[47px] leading-[normal] left-[1000px] not-italic text-[24px] text-black top-[25px] w-[175px]">Control:Tenzin</p>
      <div className="absolute css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[33px] leading-[normal] left-[1269px] not-italic text-[24px] text-black top-[23px] w-[171px]">
        <p className="css-4hzbpn css-8zr56v mb-0">Mode: Chess</p>
        <p className="css-4hzbpn css-8zr56v">&nbsp;</p>
      </div>
      <p className="absolute css-4hzbpn css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[58px] leading-[normal] left-[1142px] not-italic text-[24px] text-black top-[157px] w-[176px]">Robot Status</p>
      <p className="absolute css-4hzbpn css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[41px] leading-[normal] left-[1142px] not-italic text-[16px] text-black top-[215px] w-[280px]">Connection: Connected</p>
      <div className="absolute bg-white css-8zr56v h-[403px] left-[277px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] top-[137px] w-[443px]" data-name="ChessBoard" />
      <p className="absolute css-4hzbpn css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[33px] leading-[normal] left-[163px] not-italic text-[16px] text-black top-[764px] w-[180px]">Move to Square</p>
      <p className="absolute css-4hzbpn css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[33px] leading-[normal] left-[163px] not-italic text-[16px] text-black top-[854px] w-[180px]">Pick</p>
      <p className="absolute css-4hzbpn css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[33px] leading-[normal] left-[446px] not-italic text-[16px] text-black top-[852px] w-[180px]">Place</p>
      <p className="absolute css-4hzbpn css-8zr56v css-skt1ck font-['Inter:Bold',sans-serif] font-bold h-[33px] leading-[normal] left-[446px] not-italic text-[16px] text-black top-[766px] w-[53px]">Home</p>
      <p className="absolute css-8zr56v css-ew64yg css-skt1ck font-['Inter:Bold',sans-serif] font-bold leading-[normal] left-[55px] not-italic text-[16px] text-black top-[985px]">Senior Project - CSC</p>
      <p className="absolute css-8zr56v css-ew64yg css-skt1ck font-['Inter:Bold',sans-serif] font-bold leading-[normal] left-[1230px] not-italic text-[16px] text-black top-[982px]">Version 0.1</p>
    </div>
  );
}