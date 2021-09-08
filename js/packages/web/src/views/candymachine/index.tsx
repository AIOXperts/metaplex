import { Layout, Button } from 'antd';
import React, { useCallback, useEffect, useState }  from 'react';
  import {  useWalletModal } from '../../../../common/dist/lib/contexts/index';
  import {useConnection} from '../../../../common/dist/lib/contexts/connection'
import { useWallet, WalletContextState } from '@solana/wallet-adapter-react';

import { useParams } from 'react-router-dom';

import Countdown from "react-countdown";
import { CircularProgress, Snackbar } from "@material-ui/core";
import { Provider, Program, web3, Wallet } from '@project-serum/anchor';
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY, TransactionInstruction } from '@solana/web3.js';
import { MintLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import names from '../../config/candymachines.json';
const CANDY_MACHINE = 'candy_machine';

const CANDY_MACHINE_PROGRAM = new web3.PublicKey(
  'cndyAnrLdpjq1Ssp1z8xxDsB8dxe7u4HL5Nxi2K5WXZ',
);
const TOKEN_METADATA_PROGRAM_ID = new web3.PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
);

const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new web3.PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);

export interface CandyMachine {
  id: web3.PublicKey,
  connection: web3.Connection;
  program: Program;
}

interface CandyMachineState {
  candyMachine: CandyMachine;
  itemsAvailable: number;
  itemsRedeemed: number;
  itemsRemaining: number;
  goLiveDate: Date,
}

export const getCandyMachineState = async (
  anchorWallet: Wallet,
  candyMachineId: web3.PublicKey,
  connection: web3.Connection,
): Promise<CandyMachineState> => {
  const provider = new Provider(connection, anchorWallet, {
    preflightCommitment: "recent",
  });
  const idl = await Program.fetchIdl(
    CANDY_MACHINE_PROGRAM,
    provider
  );
  const program = new Program(idl, CANDY_MACHINE_PROGRAM, provider);
  const candyMachine = {
    id: candyMachineId,
    connection,
    program,
  }
  
  const state: any = await program.account.candyMachine.fetch(candyMachineId);
  const itemsAvailable = state.data.itemsAvailable.toNumber();
  const itemsRedeemed = state.itemsRedeemed.toNumber();
  const itemsRemaining = itemsAvailable - itemsRedeemed;
  let goLiveDate = state.data.goLiveDate.toNumber();
  goLiveDate = new Date(goLiveDate * 1000);

  return {
    candyMachine,
    itemsAvailable,
    itemsRedeemed,
    itemsRemaining,
    goLiveDate,
  };
}

const getTokenWallet = async function (wallet: web3.PublicKey, mint: web3.PublicKey) {
  return (
    await web3.PublicKey.findProgramAddress(
      [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
    )
  )[0];
};

export function createAssociatedTokenAccountInstruction(
  associatedTokenAddress: web3.PublicKey,
  payer: web3.PublicKey,
  walletAddress: web3.PublicKey,
  splTokenMintAddress: web3.PublicKey,
) {
  const keys = [
    {
      pubkey: payer,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: associatedTokenAddress,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: walletAddress,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: splTokenMintAddress,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: web3.SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];
  return new web3.TransactionInstruction({
    keys,
    programId: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
    data: Buffer.from([]),
  });
}

const getCandyMachine = async (config: web3.PublicKey, uuid: string) => {
  return await PublicKey.findProgramAddress(
    [Buffer.from(CANDY_MACHINE), config.toBuffer(), Buffer.from(uuid)],
    CANDY_MACHINE_PROGRAM,
  );
};

const getMetadata = async (
  mint: web3.PublicKey,
): Promise<web3.PublicKey> => {
  return (
    await web3.PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID,
    )
  )[0];
};

const getMasterEdition = async (
  mint: web3.PublicKey,
): Promise<web3.PublicKey> => {
  return (
    await PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from('edition'),
      ],
      TOKEN_METADATA_PROGRAM_ID,
    )
  )[0];
};

export const CandyMachineView = () => {
 
      const [balance, setBalance] = useState<number>();
      const [redeemed, setRedeemed] = useState<number>();
      const [available, setAvailable] = useState<number>();//candymachine.data.itemsAvailable seems to be intermittently not working 
      const [remaining, setRemaining] = useState<number>(); //candymachine.data.itemsRemaining seems to be intermittently not working
      const [startingTotal, setStartAmount] = useState<number>();
      const [isActive, setIsActive] = useState(false); // true when countdown completes
      const [isSoldOut, setIsSoldOut] = useState(false); // true when items remaining is zero
      const [isMinting, setIsMinting] = useState(false); // true when user got to press MINT
    
  
  const [candyMachine, setCandyMachine] = useState<CandyMachine>();
  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: "",
    severity: undefined,
  });

  const { id } = useParams<{ id: string }>();
  const wallet = useWallet();
  const connection = useConnection();
  
  const { setVisible } = useWalletModal();
  const connect = useCallback(
    () => (wallet.wallet ? wallet.connect().catch() : setVisible(true)),
    [wallet.wallet, wallet.connect, setVisible],
  );

  // This is from the .cache directory after uploading, copy yours here without "items"
  var cachedContent = {"program":{"uuid":"2DEZfF","config":"2DEZfFuMSfNsohnWJY5r9irHynYsx8GWiWnNnVfwXRoL"}};
  var exists = false;
  var title = '';
  var payTo = '';
  var start = '';
  var SolPrice = 0.00;
  var startAmount = startingTotal;
  var mainImage = '';
  var description = '';
  var creators;
  for(var i = 0; i < Object.keys(names).length; i++){
    if(Object.keys(names)[i] == id){
      exists = true;
      title = Object.values(names)[i].name;
      cachedContent = {"program":{"uuid": Object.values(names)[i].uuid, "config": id}}
      start = Object.values(names)[i].startDate;
      SolPrice = parseFloat(Object.values(names)[i].price);
      startAmount = Object.values(names)[i].total;
      mainImage = Object.values(names)[i].mainImage;
      description = Object.values(names)[i].description;
      creators = Object.values(names)[i].creators;
      break;
    }
  }
  const candyMachineId = new web3.PublicKey(id);
  
  const [startDate, setStartDate] = useState(new Date(start));
  const mint = async ({wallet, connection}: {wallet: WalletContextState, connection: Connection}) => {
    // Set price here to the same you specified when setting up candy mashine
    const price = SolPrice;
    const lamports =  price * LAMPORTS_PER_SOL;

    const mint = web3.Keypair.generate();

    if (wallet && wallet.wallet && wallet.publicKey) {
      const token = await getTokenWallet(wallet.publicKey, mint.publicKey);
      const provider = new Provider(connection, {
        ...wallet.wallet,
        signAllTransactions: wallet.signAllTransactions,
        signTransaction: wallet.signTransaction,
        publicKey: wallet.publicKey
      }, {
        preflightCommitment: 'recent',
      });
      const idl = await Program.fetchIdl(CANDY_MACHINE_PROGRAM, provider);
      const anchorProgram = new Program(idl, CANDY_MACHINE_PROGRAM, provider);
      const config = new web3.PublicKey(cachedContent.program.config);
      const [candyMachine, bump] = await getCandyMachine(
        config,
        cachedContent.program.uuid,
      );

      const candy = await anchorProgram.account.candyMachine.fetch(candyMachine);

      if ((candy as any)?.itemsRedeemed?.toNumber() - (candy as any)?.data?.itemsAvailable?.toNumber() === 0) {
        alert('All NFTs have been sold');
      }

      const metadata = await getMetadata(mint.publicKey);
      const masterEdition = await getMasterEdition(mint.publicKey);
      try{
        const tx = await anchorProgram.rpc.mintNft({
          accounts: {
            config: config,
            candyMachine: candyMachine,
            payer: wallet.publicKey,
            //@ts-ignore
            wallet: candy.wallet,
            mint: mint.publicKey,
            metadata,
            masterEdition,
            mintAuthority: wallet.publicKey,
            updateAuthority: wallet.publicKey,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent:SYSVAR_RENT_PUBKEY,
            clock:SYSVAR_CLOCK_PUBKEY,
          },
          signers: [mint],
          instructions: [
            web3.SystemProgram.createAccount({
              fromPubkey: wallet.publicKey,
              newAccountPubkey: mint.publicKey,
              space: MintLayout.span,
              lamports: await provider.connection.getMinimumBalanceForRentExemption(
                MintLayout.span,
              ),
              programId: TOKEN_PROGRAM_ID,
            }),
            Token.createInitMintInstruction(
              TOKEN_PROGRAM_ID,
              mint.publicKey,
              0,
              wallet.publicKey,
              wallet.publicKey,
            ),
            createAssociatedTokenAccountInstruction(
              token,
              wallet.publicKey,
              wallet.publicKey,
              mint.publicKey,
            ),
            Token.createMintToInstruction(
              TOKEN_PROGRAM_ID,
              mint.publicKey,
              token,
              wallet.publicKey,
              [],
              1,
            ),
          ],
        });
      }catch(error:any){ //stole this from https://github.com/exiled-apes/candy-machine-mint
        let message = error.msg || "Minting failed! Please try again!";
      if (!error.msg) {
        if (error.message.indexOf("0x138")) {
        } else if (error.message.indexOf("0x137")) {
          message = `SOLD OUT!`;
        } else if (error.message.indexOf("0x135")) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          message = `SOLD OUT!`;
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }alert(message);
      }
    } 
  }

  useEffect(()=> {
    (async () =>{
      if(wallet?.publicKey){
        const mint = web3.Keypair.generate();
      const token = await getTokenWallet(wallet.publicKey, mint.publicKey);
      const provider = new Provider(connection, {
        ...wallet.wallet,
        signAllTransactions: wallet.signAllTransactions,
        signTransaction: wallet.signTransaction,
        publicKey: wallet.publicKey
      }, {
        preflightCommitment: 'recent',
      });
      const idl = await Program.fetchIdl(CANDY_MACHINE_PROGRAM, provider);
      const anchorProgram = new Program(idl, CANDY_MACHINE_PROGRAM, provider);
      const config = new web3.PublicKey(cachedContent.program.config);
      const [candyMachine, bump] = await getCandyMachine(
        config,
        cachedContent.program.uuid,
      );

      const candy : any = await anchorProgram.account.candyMachine.fetch(candyMachine);
      const itemsAvailable = (candy.itemsAvailable?.toNumber());
      const itemsRedeemed = (candy.itemsRedeemed?.toNumber());
      setAvailable(itemsAvailable);
      setRedeemed(itemsRedeemed);
      }
    })();
  },[wallet, connection]);

  useEffect(() => {
    (async () => {
      if (wallet?.publicKey) {
        const balance = await connection.getBalance(wallet.publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
      }
    })();
  }, [wallet, connection]);
/*
  useEffect(() => {
    (async () => {
      if (
        !wallet ||
        !wallet.publicKey ||
        !wallet.signAllTransactions ||
        !wallet.signTransaction
      ) {
        return;
      }

      const anchorWallet = {
        publicKey: wallet.publicKey,
        signAllTransactions: wallet.signAllTransactions,
        signTransaction: wallet.signTransaction,
      } as Wallet;

      const { candyMachine, goLiveDate, itemsRemaining } =
        await getCandyMachineState(
          anchorWallet,
          candyMachineId,
          connection
        );

      setIsSoldOut(itemsRemaining === 0);
      setStartDate(goLiveDate);
      setCandyMachine(candyMachine);
    })();
  }, [wallet, candyMachineId, connection]);
*/
  return (
    <Layout style={{ margin: 0, marginTop: 30, alignItems: 'center' }}>
      <h1>{title}</h1>
      <img src={mainImage}/>
      {!wallet.connected ? (
        <Button type="primary" className="app-btn" onClick={()=>connect()}>
          Connect Wallet
        </Button>
      ): (
        <Button type="primary" className="app-btn" disabled={isSoldOut || isMinting || !isActive} onClick={ () =>  mint({wallet, connection})}>
          {isSoldOut ? (
              "SOLD OUT"
            ) : isActive ? (
              isMinting ? (
                <CircularProgress />
              ) : (
                "MINT"
              )
            ) : (
              <Countdown
                date={startDate}
                onMount={({ completed }) => completed && setIsActive(true)}
                onComplete={() => setIsActive(true)}
                renderer={renderCounter}
              /> 
            )}
        </Button>
      )
    }
    
    <span>Start Date: {startDate.toDateString()}</span>
    <span>Price (Sol): {SolPrice.toString()}</span>
    <span>Total Redeemed: {redeemed?.toString()}</span>
    <span>Total Supply: {startAmount?.toString()}</span>
    <span>Total Remaining: {((startAmount || 0) - (redeemed || 0))}</span>
    </Layout>
  );
  interface AlertState {
    open: boolean;
    message: string;
    severity: "success" | "info" | "warning" | "error" | undefined;
  }
};
const renderCounter = ({ days, hours, minutes, seconds, completed }: any) => {
    return (
      <span>
        {days} days, {hours} hours, {minutes} minutes, {seconds} seconds
      </span>
    );
  };