
"use client"
import Image from "next/image";
import { Radar } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, RadialLinearScale, PointElement, LineElement, Filler } from "chart.js"
import { Dispatch, Reducer, useEffect, useReducer, useRef, useState } from "react";
import axios from "axios";

ChartJS.register(ArcElement, Tooltip, Legend, RadialLinearScale, PointElement, LineElement, Filler)

interface GitHubProfile {
  name: string;
  bio: string;
  blog: string;
  login: string;
  avatar_url: string;
  repos_url: string;
  created_at: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  description: string;
  html_url: string;
  language: string;
  homepage?: string;
  watchers: number;
  forks: number;
  popularity: number;
  watchersLabel: string;
  forksLabel: string;
  isOwner: boolean;
  date: number;
}

interface Language {
  name: string;
  popularity: number;
  url: string;
  percent: number;
}

interface GitHubData {
  followers: number;
  publicRepos: number;
  starsReceived: number;
  forks: number;
  totalCommits: number;
  organizations: number;
  totalIssues: number;
  totalPRsMerged: number;
  // yearsOnGitHub: number;
  userJoinedDate: Date;
}

enum ProfileUpdateActionKind {
  githubProfileAction = "actionGithubProfileAction",
  githubDataAction = "actionGithubData",
  githubRepoAction = "actionGithubRepo",
  languageAction = "actionLanguageAction"
}

type ProfileUpdateAction = {
  type: ProfileUpdateActionKind.githubProfileAction,
  payload: GitHubProfile
} | {
  type: ProfileUpdateActionKind.githubDataAction,
  payload: GitHubData
} | {
  type: ProfileUpdateActionKind.githubRepoAction,
  payload: GitHubRepo[]
} | {
  type: ProfileUpdateActionKind.languageAction,
  payload: Language[]
}

type ProfileState = {
  githubProfile: GitHubProfile | null,
  githubData: GitHubData | null,
  githubRepo: GitHubRepo[] | null,
  language: Language[] | null,
}

const profileReducer: Reducer<ProfileState, ProfileUpdateAction> = (state, action) => {
  const { type, payload } = action
  switch (type) {
    case ProfileUpdateActionKind.githubProfileAction:
      return {
        ...state,
        githubProfile: payload
      }
    case ProfileUpdateActionKind.githubDataAction:
      return {
        ...state,
        githubData: payload
      }
  }
  return {
    ...state
  }
}

const CACHE_EXPIRATION_TIME = 3600000; // in milliseconds

const fetchData = async (url: string) => {
  const cachedData = getCachedData(url);
  if (cachedData && cachedData.expirationTime > Date.now()) {
    return cachedData.data;
  }

  const response = await axios.get(url);
  const data = response.data;
  const res = JSON.stringify(data);

  cacheData(url, res);

  return res;
};

const getCachedData = (url: string) => {
  const cachedDataString = localStorage.getItem(url);
  if (cachedDataString) {
    const cachedData = JSON.parse(cachedDataString);
    return {
      data: cachedData.data,
      expirationTime: cachedData.expirationTime,
    };
  }
  return null;
};

const cacheData = (url: string, data: string) => {
  const cacheEntry = {
    data,
    expirationTime: Date.now() + CACHE_EXPIRATION_TIME,
  };
  localStorage.setItem(url, JSON.stringify(cacheEntry));
};


const data = {
  labels: [
    'Total PR merged',
    'Total issue',
    'Star',
    'Total Commits',
    'Organization',
    'Follower'
  ],
  datasets: [{
    label: 'My First Dataset',
    data: [65, 59, 90, 81, 56, 40],
    fill: true,
    backgroundColor: 'rgba(255, 99, 132, 0.2)',
    borderColor: 'rgb(255, 99, 132)',
    pointBackgroundColor: 'rgb(255, 99, 132)',
    pointBorderColor: '#fff',
    pointHoverBackgroundColor: '#fff',
    pointHoverBorderColor: 'rgb(255, 99, 132)'
  }, {
    label: 'My Second Dataset',
    data: [28, 48, 40, 19, 96, 100],
    fill: true,
    backgroundColor: 'rgba(54, 162, 235, 0.2)',
    borderColor: 'rgb(54, 162, 235)',
    pointBackgroundColor: 'rgb(54, 162, 235)',
    pointBorderColor: '#fff',
    pointHoverBackgroundColor: '#fff',
    pointHoverBorderColor: 'rgb(54, 162, 235)'
  }]
};

const fetchProfileData = async (username: string, dispatch: Dispatch<ProfileUpdateAction>) => {
  const profileData: string | Error = await fetchData(
    `https://api.github.com/users/${username}`
  )
    .then((res) => res as unknown as string)
    .catch((e) => {
      console.log(e);
      return e
    });

  if (profileData instanceof Error) {
    console.log(profileData);
    alert("[ERROR]: " + profileData);
    return
  }

  // TODO: write a validation
  if (typeof profileData === "string") {
    dispatch({
      type: ProfileUpdateActionKind.githubProfileAction,
      payload: JSON.parse(profileData)
    })
    return
  }

  if (typeof profileData === "undefined") {
    alert("failed to fetch data")
    return
  }
  throw new Error("something went wrong! should never have reached here");
}

const fetchUserData = async (username: string, dispatch: Dispatch<ProfileUpdateAction>) => {
  // Fetching basic user data
  const userRes = JSON.parse(await fetchData(
    `https://api.github.com/users/${username}`
  ));
  const orgsRes = JSON.parse(await fetchData(
    `https://api.github.com/users/${username}/orgs`
  ));

  // Fetching stars and forks
  const reposRes = JSON.parse(await fetchData(
    `https://api.github.com/users/${username}/repos?per_page=100`
  ));
  const starsReceived = reposRes.map(
    (acc: any, repo: { stargazers_count: any }) =>
      acc + repo.stargazers_count,
    0
  );
  const forks = reposRes.map(
    (acc: any, repo: { forks_count: any }) => acc + repo.forks_count,
    0
  );

  // Fetching total commits (approximation using PushEvents)
  const eventsRes = JSON.parse(await fetchData(
    `https://api.github.com/users/${username}/events/public`
  ));

  const totalCommits = eventsRes
    .filter((event: { type: string }) => event.type === "PushEvent")
    .reduce(
      (acc: any, event: { payload: { commits: string | any[] } }) =>
        acc + event.payload.commits.length,
      0
    );

  // Fetching total issues created and PRs merged
  const issuesRes = await fetchData(
    `https://api.github.com/search/issues?q=author:${username}+type:issue`
  );
  const prsRes = await fetchData(
    `https://api.github.com/search/issues?q=author:${username}+type:pr+is:merged`
  );

  // Setting the data
  dispatch({
    type: ProfileUpdateActionKind.githubDataAction,
    payload: {
      followers: userRes.followers,
      publicRepos: userRes.public_repos,
      starsReceived,
      forks,
      totalCommits,
      organizations: orgsRes.length,
      totalIssues: issuesRes.total_count,
      totalPRsMerged: prsRes.total_count,
      // yearsOnGitHub: userData.yearsOnGitHub,
      userJoinedDate: new Date(userRes.created_at),
    }
  });
}

const compare = (u1: GitHubData, u2: GitHubData) => {


}

export default function Page({ params }: { params: { slug: string[] } }) {
  const [username1, username2] = params.slug
  const initialState: ProfileState = {
    githubProfile: null,
    githubData: null,
    githubRepo: null,
    language: null
  }
  const [state1, dispatch1] = useReducer(profileReducer, initialState);
  const [state2, dispatch2] = useReducer(profileReducer, initialState);

  const profileImageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    fetchProfileData(username1, dispatch1)
    fetchProfileData(username2, dispatch2)

    fetchUserData(username1, dispatch1)
    fetchUserData(username2, dispatch2)
  }, [])

  return (
    <div className="flex-grow p-4 order-1 lg:order-2">
      <div className="mx-auto flex justify-center">
        <div className="bg-[#020817] rounded-md bg-clip-padding dark:backdrop-filter dark:backdrop-blur-md dark:bg-opacity-10 shadow-md p-6 max-w-5xl">
          <div className="flex w-full flex-row">
            <div className="flex w-full flex-col basis-1/2">
              <h1 className="text-xl font-bold text-[#F8FAFC]">{username1}</h1>
              <div className="flex w-full justify-center">
                <Image
                  src={state1.githubProfile?.avatar_url ?? "https://images.unsplash.com/photo-1628260412297-a3377e45006f?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fGNhcnRvb258ZW58MHx8MHx8fDA%3D"}
                  alt="Profile"
                  className="rounded-full mb-4 pt-5"
                  width={124}
                  height={124}
                  ref={profileImageRef}
                />
              </div>
              <div className="font-light">
                {state1.githubProfile?.bio ?? ""}
              </div>
            </div>
            <div className="flex flex-col justify-center align-middle font-bold text-xl">vs</div>
            <div className="flex flex-col w-full basis-1/2">
              <h1 className="text-xl font-bold text-[#F8FAFC]">{username2}</h1>
              <div className="border-white flex w-full justify-center">
                <Image
                  src={state2.githubProfile?.avatar_url ?? "https://images.unsplash.com/photo-1628260412297-a3377e45006f?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fGNhcnRvb258ZW58MHx8MHx8fDA%3D"}
                  alt="Profile"
                  className="rounded-full mb-4 pt-5"
                  width={124}
                  height={124}
                />
              </div>
              <div className="font-light">
                {state2.githubProfile?.bio ?? ""}
              </div>
            </div>
          </div>
          <div className="flex-col w-full pt-10">
            <div className="flex w-full">
              <div className="flex gap-20 p-2 pl-10">
                <div className="">
                  {username1}
                </div>
                <div className="text-gray-400">
                  {username2}
                </div>
              </div>
            </div>
            <div className="border"></div>
            <div className="flex flex-col gap-5">
              <div className="flex">
                <Radar options={{
                  scales: {
                    r: {
                      grid: {
                        color: 'rgba(29,100,215,0.4)'
                      },
                      ticks: {
                        backdropColor: "rbga(0,0,0,0)",
                        color: 'white'
                      }
                    }
                  }
                }} data={data} />
              </div>
              <div className="flex flex-col pt-2 gap-5">
                <div className="bg-violet-900 border border-blue-400 rounded-sm p-2">
                  <h2 className="text-xl font-bold">Pros!</h2>
                  <ul className="flex flex-col font-light gap-1">
                    <li>- {username1} close 30% more PR than {username2}</li>
                    <li>- {username1} has 70% more PR acceptance than {username2}</li>
                    <li>- {username1} has created 10% more PR than {username2}</li>
                  </ul>
                </div>

                <div className="bg-red-700 border border-red-400 rounded-sm p-2">
                  <h2 className="text-xl font-bold">Cons!</h2>
                  <ul className="flex flex-col font-light gap-1 pl-2">
                    <li>- {username1} close 30% more PR than {username2}</li>
                    <li>- {username1} has 70% more PR acceptance than {username2}</li>
                    <li>- {username1} has created 10% more PR than {username2}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
