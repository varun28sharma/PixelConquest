import SidebarLeft from "@/components/SidebarLeft";
import SidebarRight from "@/components/SidebarRight";
import MapWorkspace from "@/components/MapWorkspace";

export default function WorkspacePage() {
  return (
    <main className="flex h-screen w-screen overflow-hidden">
      {/* Left Sidebar (~300px) */}
      <section className="w-[300px] border-r border-white/10 bg-[#161a23] hidden md:flex flex-col z-10">
        <SidebarLeft />
      </section>

      {/* Center Workspace (flex-grow) */}
      <section className="flex-1 relative flex flex-col bg-[#0a0c10]">
        <MapWorkspace />
      </section>

      {/* Right Sidebar (~320px) */}
      <section className="w-[320px] border-l border-white/10 bg-[#161a23] hidden lg:flex flex-col z-10">
        <SidebarRight />
      </section>
    </main>
  );
}