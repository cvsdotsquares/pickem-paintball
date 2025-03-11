"use client";

import AccountSettings from "@/src/components/settings";
import { Badge } from "@/src/components/ui/Badge";
import { IconButton } from "@/src/components/ui/IconButton";
import { IconWithBackground } from "@/src/components/ui/IconWithBackground";
import { LinkButton } from "@/src/components/ui/LinkButton";
import { Tabs } from "@/src/components/ui/Tabs";
import React, { useState } from "react";


function ProfilePage() {
    const [activeTab, setActiveTab] = useState("Stats");

    const renderTabContent = () => {
        switch (activeTab) {
            case "Stats":
                return (
                    <div className="flex w-full flex-wrap items-start gap-6 rounded-md bg-neutral-50 px-6 py-6">
                        <IconWithBackground
                            variant="neutral"
                            size="large"
                            icon="FeatherPlus"
                        />
                        <div className="flex grow shrink-0 basis-0 flex-col items-start gap-6">
                            <div className="flex flex-col items-start gap-2">
                                <span className="text-heading-3 font-heading-3 text-default-font">
                                    Add a project
                                </span>
                                <span className="text-body font-body text-subtext-color">
                                    Your projects should highlight your best skills and
                                    experience.
                                </span>
                            </div>
                            <LinkButton
                                variant="brand"
                                icon="FeatherWand2"
                                onClick={(
                                    event: React.MouseEvent<HTMLButtonElement>
                                ) => { }}
                            >
                                Import content in seconds
                            </LinkButton>
                        </div>
                    </div>
                );

            case "Picks":
                return <div>Here are your picks...</div>;
            case "Settings":
                return <AccountSettings />;
            default:
                return null;
        }
    };

    return (

        <div className="flex flex-col items-start h-auto">

            <div className=" flex w-full  min-h-screen flex-col items-center gap-4 bg-default-background py-12 ">
                <div className="flex w-full max-w-[1100px] justify-evenly m-auto flex-wrap items-start gap-8">
                    <div className="flex min-w-[240px] max-w-[300px] grow shrink-0 basis-0 flex-col items-center gap-6 rounded-md border border-solid border-neutral-border px-8 pt-12 pb-8 shadow-sm relative">
                        <IconButton
                            className="absolute right-4 top-4"
                            size="large"
                            icon="FeatherShare2"
                            onClick={(event: React.MouseEvent<HTMLButtonElement>) => { }}
                        />
                        <div className="flex w-full flex-col items-center gap-12">
                            <div className="flex flex-col items-center gap-6 relative">
                                <div className="flex h-36 w-36 flex-none flex-col items-center justify-center gap-2 overflow-hidden rounded-full bg-brand-100 relative">
                                    <img
                                        className="h-36 w-36 flex-none object-cover absolute"
                                        src="https://res.cloudinary.com/subframe/image/upload/v1711417514/shared/ubsk7cs5hnnaj798efej.jpg"
                                    />
                                </div>
                                <Badge
                                    className="absolute -bottom-4"
                                    variant="success"
                                    icon="FeatherCheck"
                                >
                                    Pro
                                </Badge>
                            </div>

                        </div>
                        <div className="flex w-full flex-col items-center gap-10">
                            <span className="w-full text-heading-1 font-heading-1 text-default-font text-center">
                                Filip Skrzesinski
                            </span>

                            <div className="flex w-full flex-col items-start gap-4">
                                <span className="w-full text-caption font-caption text-subtext-color">
                                    Badges
                                </span>
                                <div className="flex w-full flex-wrap items-start gap-2">
                                    <Badge variant="neutral">Badge 1</Badge>
                                    <Badge variant="neutral">Badge 2</Badge>
                                    <Badge variant="neutral">Badge 3</Badge>
                                    <Badge variant="neutral">Badge 4</Badge>
                                    <Badge variant="neutral">Badge 5</Badge>
                                    <Badge variant="neutral">Badge 6</Badge>
                                </div>
                            </div>

                            <div className="flex w-full flex-col items-start gap-4">
                                <span className="w-full text-caption font-caption text-subtext-color">
                                    Support
                                </span>
                                <div className="flex w-full flex-wrap items-start gap-2">
                                    <div className="flex flex-col items-start gap-4">

                                        <div className="flex w-full items-center gap-2">
                                            <IconWithBackground
                                                variant="neutral"
                                                size="small"
                                                icon="FeatherMapPin"
                                            />
                                            <span className="grow shrink-0 basis-0 text-body font-body text-default-font">
                                                Country
                                            </span>
                                        </div>
                                        <div className="flex w-full items-center gap-2">
                                            <IconWithBackground
                                                variant="neutral"
                                                size="small"
                                                icon="FeatherClock"
                                            />
                                            <span className="grow shrink-0 basis-0 text-body font-body text-default-font">
                                                Team
                                            </span>
                                        </div>
                                        <div className="flex w-full items-center gap-2">
                                            <IconWithBackground
                                                variant="neutral"
                                                size="small"
                                                icon="FeatherMessagesSquare"
                                            />
                                            <span className="grow shrink-0 basis-0 text-body font-body text-default-font">
                                                Player
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                    <div className="flex grow shrink-0 basis-0 flex-col items-start gap-8">
                        <div className="flex w-full min-w-[240px] flex-col items-start">
                            <span className="text-heading-1 font-heading-1 text-default-font mobile:text-4xl">
                                Welcome to Pickem Paintball!
                            </span>
                        </div>
                        <Tabs>
                            <Tabs.Item active={activeTab === "Stats"} onClick={() => setActiveTab("Stats")}>
                                Stats
                            </Tabs.Item>
                            <Tabs.Item active={activeTab === "Picks"} onClick={() => setActiveTab("Picks")}>
                                Picks
                            </Tabs.Item>
                            <Tabs.Item active={activeTab === "Settings"} onClick={() => setActiveTab("Settings")}>
                                Settings
                            </Tabs.Item>
                        </Tabs>
                        <div className="flex w-full flex-col items-start gap-8 pb-8">
                            {renderTabContent()}

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ProfilePage;