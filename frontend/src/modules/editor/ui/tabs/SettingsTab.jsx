// frontend/src/modules/editor/ui/tabs/SettingsTab.jsx
import React, { Suspense, useState, useEffect } from 'react';
import { findBlockByPath } from '../../core/blockUtils';
import { getSettingsComponent } from '../../core/blockRegistry';
import { isGlobalType } from '../../core/globalBlockTypes';
import AdvancedSettingsTab from './AdvancedSettingsTab';
import { Settings, FileText, MousePointerClick, AlertCircle, SlidersHorizontal, Loader2 } from 'lucide-react';

const SettingsTab = ({ blocks, selectedBlockPath, onUpdateBlockData, siteData }) => {
    const [activeTab, setActiveTab] = useState('content');
    const selectedBlock = selectedBlockPath 
        ? findBlockByPath(blocks, selectedBlockPath) 
        : null;
    const isGlobalBlock = isGlobalType(selectedBlock?.type);
    useEffect(() => {
        if (isGlobalBlock && activeTab === 'advanced') {
            setActiveTab('content');
        }
    }, [isGlobalBlock, activeTab]);

    if (!selectedBlock) {
        return (
            <div className="flex flex-col items-center justify-center p-5 text-center text-(--platform-text-secondary) min-h-[60vh]">
                <div className="w-18 h-18 rounded-full bg-(--platform-bg) flex items-center justify-center mb-5 border border-(--platform-border-color) shadow-sm">
                    <MousePointerClick size={32} className="text-(--platform-accent) opacity-90" />
                </div>
                <h3 className="text-[1.05rem] font-semibold text-(--platform-text-primary) mb-2">
                    Налаштування блоку
                </h3>
                <p className="text-[0.85rem] max-w-60 leading-relaxed mx-auto">
                    Оберіть будь-який блок у редакторі або в списку шарів, щоб змінити його вміст та вигляд.
                </p>
            </div>
        );
    }

    const SettingsComponent = getSettingsComponent(selectedBlock.type);
    const handleLiveUpdate = (newData, addToHistory = true) => {
        onUpdateBlockData(selectedBlockPath, newData, addToHistory);
    };

    const TabButton = ({ id, label, icon: Icon }) => {
        const isActive = activeTab === id;
        return (
            <button
                onClick={() => setActiveTab(id)}
                className={`
                    flex-1 flex items-center justify-center gap-2 py-2.5 bg-transparent border-none border-b-2 text-[0.9rem] cursor-pointer transition-all duration-200
                    ${isActive 
                        ? 'border-(--platform-accent) text-(--platform-accent) font-semibold' 
                        : 'border-transparent text-(--platform-text-secondary) font-medium hover:text-(--platform-text-primary)'}
                `}
            >
                <Icon size={16} />
                <span>{label}</span>
            </button>
        );
    };

    return (
        <div className="min-h-full h-full bg-(--platform-sidebar-bg) pb-20 relative">
            <div className="sticky top-0 z-20 bg-(--platform-sidebar-bg) border-b border-(--platform-border-color)">
                <div className="p-3 px-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-(--platform-bg) border border-(--platform-border-color) text-(--platform-accent) flex items-center justify-center">
                            <Settings size={18} />
                        </div>
                        <div>
                            <div className="text-[0.7rem] text-(--platform-text-secondary) uppercase font-bold tracking-wider">
                                Редагування
                            </div>
                            <div className="text-[1.05rem] font-bold capitalize text-(--platform-text-primary)">
                                {selectedBlock.name || selectedBlock.type.replace('global-', 'Глобальний ')}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex px-4">
                    <TabButton id="content" label="Контент" icon={FileText} />
                    {!isGlobalBlock && (
                        <TabButton id="advanced" label="Вигляд" icon={SlidersHorizontal} />
                    )}
                </div>
            </div>
            <div className="p-4 animate-in fade-in slide-in-from-bottom-1 duration-300">
                {activeTab === 'content' && (
                    <div>
                        {SettingsComponent ? (
                            <Suspense
                                fallback={
                                    <div className="w-full flex items-center justify-center py-10">
                                        <Loader2 size={28} className="animate-spin text-(--platform-accent)" />
                                    </div>
                                }
                            >
                                <SettingsComponent
                                    data={selectedBlock.data}
                                    onChange={handleLiveUpdate}
                                    siteData={siteData}
                                />
                            </Suspense>
                        ) : (
                            <div className="p-8 text-center border border-dashed border-(--platform-border-color) rounded-lg">
                                <div className="text-(--platform-text-secondary) mb-4 flex justify-center">
                                    <AlertCircle size={32} className="opacity-50" />
                                </div>
                                <div className="text-[0.9rem] text-(--platform-text-secondary)">
                                    Налаштування контенту для блоку <b>{selectedBlock.type}</b> в розробці.
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'advanced' && !isGlobalBlock && (
                    <AdvancedSettingsTab 
                        data={selectedBlock.data}
                        onUpdate={handleLiveUpdate}
                    />
                )}
            </div>
        </div>
    );
};

export default SettingsTab;